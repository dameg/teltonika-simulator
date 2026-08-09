import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { randomUUID } from "node:crypto";

import { runLiveSession } from "../../live-session";
import type { VehicleSimulatorCheckpoint } from "../../simulation";
import {
  DashboardDomainError,
  normalizeImei,
  type DashboardDeviceRecord,
  type DashboardLogContextValue,
  type DashboardLogEvent,
  type DashboardLogEventType,
  type DashboardLogSeverity,
  type DashboardRunRecord,
  type DashboardRunStatus,
} from "../domain";
import {
  type DashboardJourneyState,
} from "../repositories";
import { DASHBOARD_STORE, type DashboardStore } from "../persistence/dashboard-store";
import { RuntimeConfigRegistry } from "./runtime-config-registry";

export interface RuntimeActionResult {
  imei: string;
  status: "started" | "stopped" | "already-stopped" | "rejected";
}

export interface RuntimeBatchResult {
  results: RuntimeActionResult[];
}

interface ActiveRunState {
  abortController: AbortController;
  completion?: Promise<void>;
  stopRequested: boolean;
  tripId: string;
}

class ActiveRunConflictError extends Error {
  readonly imei: string;

  constructor(imei: string) {
    super(`Run already active for IMEI ${imei}`);
    this.name = "ActiveRunConflictError";
    this.imei = imei;
  }
}

@Injectable()
export class RuntimeService implements OnModuleInit {
  private readonly activeRuns = new Map<string, ActiveRunState>();

  constructor(
    @Inject(DASHBOARD_STORE)
    private readonly store: DashboardStore,
    @Inject(RuntimeConfigRegistry)
    private readonly runtimeConfigs: RuntimeConfigRegistry,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.store.interruptActiveRuns();
  }

  async startDevice(imei: string): Promise<RuntimeActionResult> {
    const device = await this.getDeviceOrThrow(imei);
    const normalizedImei = device.imei;

    if (this.activeRuns.has(normalizedImei)) {
      throw new ActiveRunConflictError(normalizedImei);
    }

    const activeRun: ActiveRunState = {
      abortController: new AbortController(),
      stopRequested: false,
      tripId: "",
    };
    this.activeRuns.set(normalizedImei, activeRun);

    try {
      const journey = await this.prepareJourney(device);
      activeRun.tripId = journey.tripId;
      this.runtimeConfigs.set(device);

      const now = Date.now();
      const runId = randomUUID();
      await this.store.startRun(
        {
          imei: normalizedImei,
          runId,
          status: "starting",
          updatedAtMs: now,
          lastStartAtMs: now,
          lastError: undefined,
        },
        {
          id: randomUUID(),
          imei: normalizedImei,
          severity: "info",
          type: "simulationStartRequested",
          message: `Simulation start requested for ${normalizedImei}.`,
          timestampMs: now,
          context: { runId },
        },
      );

      activeRun.completion = this.runDeviceSession(
        device,
        runId,
        journey.tripId,
        activeRun.abortController.signal,
      );

      return { imei: normalizedImei, status: "started" };
    } catch (error) {
      if (this.activeRuns.get(normalizedImei) === activeRun) {
        this.activeRuns.delete(normalizedImei);
        this.runtimeConfigs.delete(normalizedImei);
      }
      throw error;
    }
  }

  async stopDevice(imei: string): Promise<RuntimeActionResult> {
    const normalizedImei = normalizeImei(imei);
    const activeRun = this.activeRuns.get(normalizedImei);
    const now = Date.now();

    if (!activeRun) {
      const record = await this.store.getRun(normalizedImei);
      if (!record) {
        throw new DashboardDomainError(
          "RUN_NOT_FOUND",
          `Run not found: ${normalizedImei}`,
        );
      }

      return { imei: normalizedImei, status: "already-stopped" };
    }

    activeRun.stopRequested = true;
    activeRun.abortController.abort();
    await this.appendLog({
      imei: normalizedImei,
      severity: "info",
      type: "simulationStopRequested",
      message: `Simulation stop requested for ${normalizedImei}.`,
      timestampMs: now,
    });

    if (activeRun.completion) await activeRun.completion;
    return { imei: normalizedImei, status: "stopped" };
  }

  async startSelectedDevices(imeis: readonly string[]): Promise<RuntimeBatchResult> {
    return {
      results: await Promise.all(imeis.map((imei) => this.startDevice(imei))),
    };
  }

  async startAllDevices(): Promise<RuntimeBatchResult> {
    const devices = await this.store.listDevices();
    const results = await Promise.all(devices
      .filter((device) => !this.activeRuns.has(device.imei))
      .map((device) => this.startDevice(device.imei)));

    return { results };
  }

  async stopAllDevices(): Promise<RuntimeBatchResult> {
    const results = await Promise.all(
      [...this.activeRuns.keys()].map((imei) => this.stopDevice(imei)),
    );
    return { results };
  }

  isActiveRunConflict(error: unknown): error is ActiveRunConflictError {
    return error instanceof ActiveRunConflictError;
  }

  private async runDeviceSession(
    device: DashboardDeviceRecord,
    runId: string,
    tripId: string,
    signal: AbortSignal,
  ): Promise<void> {
    const normalizedImei = device.imei;

    try {
      const persistedJourney = await this.store.getActiveJourney<VehicleSimulatorCheckpoint>(normalizedImei);
      const result = await runLiveSession({
        ...device.config,
        imei: normalizedImei,
        signal,
        checkpoint: persistedJourney?.checkpoint,
        acceptedRecordCount: persistedJourney?.acceptedRecordCount,
        getCurrentConfiguration: () => {
          const current = this.runtimeConfigs.get(normalizedImei) ?? device;
          return {
            intervalMs: current.config.intervalMs,
            simulationSpeed: current.config.simulationSpeed,
            drivingStyle: current.config.drivingStyle,
            seed: current.config.seed,
            deviceProfile: current.config.deviceProfile,
            packetCount: current.config.packetCount,
            configRevision: current.configRevision,
          };
        },
        onRecordAccepted: async (_record, _packetHex, context) => {
          await this.store.updateLatestJourneyCheckpoint(
            normalizedImei,
            context.checkpoint,
          );
        },
        logger: {
          info: (message) => this.handleLiveSessionLog(normalizedImei, runId, message),
          error: async (message) => {
            await this.appendLog({
              imei: normalizedImei,
              severity: "error",
              type: "runFailed",
              message,
              timestampMs: Date.now(),
            });
          },
        },
      });

      const activeRun = this.activeRuns.get(normalizedImei);
      const stopRequested = activeRun?.stopRequested ?? signal.aborted;

      if (result.kind === "rejected") {
        await this.finalizeRun(normalizedImei, "rejected");
        return;
      }

      if (stopRequested || signal.aborted) {
        await this.finalizeRun(normalizedImei, "stopped");
        return;
      }

      await this.finalizeRun(normalizedImei, "completed");
    } catch (error) {
      const activeRun = this.activeRuns.get(normalizedImei);
      const stopRequested = activeRun?.stopRequested ?? signal.aborted;

      if (stopRequested || isAbortError(error)) {
        await this.finalizeRun(normalizedImei, "stopped");
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      await this.finalizeRun(normalizedImei, "failed", message);
    } finally {
      this.activeRuns.delete(normalizedImei);
      this.runtimeConfigs.delete(normalizedImei);
    }
  }

  private async finalizeRun(
    imei: string,
    status: Extract<DashboardRunStatus, "completed" | "failed" | "rejected" | "stopped">,
    lastError?: string,
  ): Promise<DashboardRunRecord> {
    const now = Date.now();
    const record = await this.store.updateRun(imei, {
      status,
      updatedAtMs: now,
      lastStopAtMs: now,
      lastError,
    });
    if (status === "completed") await this.store.finishJourney(imei, true);

    const outcomeMap: Record<
      typeof status,
      { message: string; severity: DashboardLogSeverity; type: DashboardLogEventType }
    > = {
      completed: {
        severity: "info",
        type: "runCompleted",
        message: `Simulation completed for ${imei}.`,
      },
      failed: {
        severity: "error",
        type: "runFailed",
        message: `Simulation failed for ${imei}${lastError ? `: ${lastError}` : "."}`,
      },
      rejected: {
        severity: "warn",
        type: "runFailed",
        message: `Simulation rejected by server for ${imei}.`,
      },
      stopped: {
        severity: "info",
        type: "runStopped",
        message: `Simulation stopped for ${imei}.`,
      },
    };

    const outcome = outcomeMap[status];
    await this.appendLog({
      imei,
      severity: outcome.severity,
      type: outcome.type,
      message: outcome.message,
      timestampMs: now,
      context: lastError ? { lastError } : undefined,
    });

    return record;
  }

  private async handleLiveSessionLog(imei: string, runId: string, message: string): Promise<void> {
    const timestampMs = Date.now();

    if (message.startsWith("tcp connected ")) {
      await this.store.updateRun(imei, {
        status: "starting",
        updatedAtMs: timestampMs,
      });
      await this.appendLog({
        imei,
        severity: "info",
        type: "tcpConnected",
        message,
        timestampMs,
        context: { runId },
      });
      return;
    }

    if (message.startsWith("imei sent ")) {
      await this.store.updateRun(imei, {
        status: "starting",
        updatedAtMs: timestampMs,
      });
      await this.appendLog({
        imei,
        severity: "info",
        type: "imeiSent",
        message,
        timestampMs,
        context: { runId },
      });
      return;
    }

    if (message.startsWith("reconnect ")) {
      await this.store.updateRun(imei, {
        status: "reconnecting",
        updatedAtMs: timestampMs,
      });
      await this.appendLog({
        imei,
        severity: "warn",
        type: "reconnectAttempted",
        message,
        timestampMs,
      });
      return;
    }

    if (message.startsWith("shutdown ")) {
      await this.appendLog({
        imei,
        severity: "info",
        type: "simulationStopRequested",
        message,
        timestampMs,
      });
      return;
    }

    if (message.startsWith("imei rejected ")) {
      await this.appendLog({
        imei,
        severity: "warn",
        type: "imeiRejected",
        message,
        timestampMs,
      });
      return;
    }

    if (message.startsWith("imei accepted ")) {
      await this.store.updateRun(imei, {
        status: "running",
        updatedAtMs: timestampMs,
      });
      await this.appendLog({
        imei,
        severity: "info",
        type: "imeiAccepted",
        message,
        timestampMs,
      });
      return;
    }

    if (message.startsWith("avl sent ")) {
      await this.store.updateRun(imei, {
        status: "running",
        updatedAtMs: timestampMs,
      });
      await this.appendLog({
        imei,
        severity: "info",
        type: "avlPacketSent",
        message,
        timestampMs,
      });

      const ackMatch = /ack=(\d+)/.exec(message);
      if (ackMatch) {
        await this.appendLog({
          imei,
          severity: "debug",
          type: "avlAcknowledged",
          message: `AVL acknowledged for ${imei}: ${ackMatch[1]}.`,
          timestampMs,
          context: { acknowledgement: Number(ackMatch[1]) },
        });
      }
      return;
    }

    if (message.startsWith("connection lost ")) {
      await this.store.updateRun(imei, {
        status: "reconnecting",
        updatedAtMs: timestampMs,
      });
      await this.appendLog({
        imei,
        severity: "warn",
        type: "reconnectAttempted",
        message,
        timestampMs,
      });
      return;
    }
  }

  private async getDeviceOrThrow(imei: string): Promise<DashboardDeviceRecord> {
    const device = await this.store.getDevice(imei);
    if (!device) {
      throw new DashboardDomainError(
        "DEVICE_NOT_FOUND",
        `Device not found: ${normalizeImei(imei)}`,
      );
    }

    return device;
  }

  private async prepareJourney(device: DashboardDeviceRecord): Promise<DashboardJourneyState> {
    const existing = await this.store.getActiveJourney(device.imei);
    if (existing && !existing.completed && existing.routeFile === device.config.routeFile) {
      return existing;
    }

    return this.store.setJourney({
      imei: device.imei,
      tripId: randomUUID(),
      routeFile: device.config.routeFile,
      acceptedRecordCount: 0,
      completed: false,
    });
  }

  private appendLog(event: Omit<DashboardLogEvent, "id">): Promise<DashboardLogEvent> {
    return this.store.appendLog({
      id: randomUUID(),
      ...event,
    });
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
