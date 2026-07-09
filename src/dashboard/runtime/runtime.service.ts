import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";

import { runLiveSession } from "../../live-session";
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
  InMemoryDashboardDeviceRepository,
  InMemoryDashboardLogRepository,
  InMemoryDashboardRuntimeRepository,
} from "../repositories";

export interface RuntimeActionResult {
  imei: string;
  status: "started" | "stopped" | "already-stopped" | "rejected";
}

export interface RuntimeBatchResult {
  results: RuntimeActionResult[];
}

interface ActiveRunState {
  abortController: AbortController;
  stopRequested: boolean;
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
export class RuntimeService {
  private readonly activeRuns = new Map<string, ActiveRunState>();

  constructor(
    @Inject(InMemoryDashboardDeviceRepository)
    private readonly deviceRepository: InMemoryDashboardDeviceRepository,
    @Inject(InMemoryDashboardRuntimeRepository)
    private readonly runtimeRepository: InMemoryDashboardRuntimeRepository,
    @Inject(InMemoryDashboardLogRepository)
    private readonly logRepository: InMemoryDashboardLogRepository,
  ) {}

  startDevice(imei: string): RuntimeActionResult {
    const device = this.getDeviceOrThrow(imei);
    const normalizedImei = device.imei;

    if (this.activeRuns.has(normalizedImei)) {
      throw new ActiveRunConflictError(normalizedImei);
    }

    const abortController = new AbortController();
    this.activeRuns.set(normalizedImei, {
      abortController,
      stopRequested: false,
    });

    const now = Date.now();
    const runId = `${normalizedImei}-${now}`;
    this.runtimeRepository.set({
      imei: normalizedImei,
      runId,
      status: "starting",
      updatedAtMs: now,
      lastStartAtMs: now,
      lastError: undefined,
    });
    this.appendLog({
      imei: normalizedImei,
      severity: "info",
      type: "simulationStartRequested",
      message: `Simulation start requested for ${normalizedImei}.`,
      timestampMs: now,
      context: { runId },
    });

    void this.runDeviceSession(device, runId, abortController.signal);

    return { imei: normalizedImei, status: "started" };
  }

  stopDevice(imei: string): RuntimeActionResult {
    const normalizedImei = normalizeImei(imei);
    const activeRun = this.activeRuns.get(normalizedImei);
    const now = Date.now();

    if (!activeRun) {
      const record = this.runtimeRepository.get(normalizedImei);
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
    this.appendLog({
      imei: normalizedImei,
      severity: "info",
      type: "simulationStopRequested",
      message: `Simulation stop requested for ${normalizedImei}.`,
      timestampMs: now,
    });

    return { imei: normalizedImei, status: "stopped" };
  }

  startSelectedDevices(imeis: readonly string[]): RuntimeBatchResult {
    return {
      results: imeis.map((imei) => this.startDevice(imei)),
    };
  }

  startAllEnabledDevices(): RuntimeBatchResult {
    const results = this.deviceRepository
      .list()
      .filter((device) => device.enabled)
      .map((device) => this.startDevice(device.imei));

    return { results };
  }

  stopAllDevices(): RuntimeBatchResult {
    const results = [...this.activeRuns.keys()].map((imei) => this.stopDevice(imei));
    return { results };
  }

  isActiveRunConflict(error: unknown): error is ActiveRunConflictError {
    return error instanceof ActiveRunConflictError;
  }

  private async runDeviceSession(
    device: DashboardDeviceRecord,
    runId: string,
    signal: AbortSignal,
  ): Promise<void> {
    const normalizedImei = device.imei;

    try {
      const result = await runLiveSession({
        ...device.config,
        imei: normalizedImei,
        signal,
        logger: {
          info: (message) => this.handleLiveSessionLog(normalizedImei, runId, message),
          error: (message) =>
            this.appendLog({
              imei: normalizedImei,
              severity: "error",
              type: "runFailed",
              message,
              timestampMs: Date.now(),
            }),
        },
      });

      const activeRun = this.activeRuns.get(normalizedImei);
      const stopRequested = activeRun?.stopRequested ?? signal.aborted;

      if (result.kind === "rejected") {
        this.finalizeRun(normalizedImei, "rejected");
        return;
      }

      if (stopRequested || signal.aborted) {
        this.finalizeRun(normalizedImei, "stopped");
        return;
      }

      this.finalizeRun(normalizedImei, "completed");
    } catch (error) {
      const activeRun = this.activeRuns.get(normalizedImei);
      const stopRequested = activeRun?.stopRequested ?? signal.aborted;

      if (stopRequested || isAbortError(error)) {
        this.finalizeRun(normalizedImei, "stopped");
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      this.finalizeRun(normalizedImei, "failed", message);
    } finally {
      this.activeRuns.delete(normalizedImei);
    }
  }

  private finalizeRun(
    imei: string,
    status: Extract<DashboardRunStatus, "completed" | "failed" | "rejected" | "stopped">,
    lastError?: string,
  ): DashboardRunRecord {
    const now = Date.now();
    const record = this.runtimeRepository.update(imei, {
      status,
      updatedAtMs: now,
      lastStopAtMs: now,
      lastError,
    });

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
    this.appendLog({
      imei,
      severity: outcome.severity,
      type: outcome.type,
      message: outcome.message,
      timestampMs: now,
      context: lastError ? { lastError } : undefined,
    });

    return record;
  }

  private handleLiveSessionLog(imei: string, runId: string, message: string): void {
    const timestampMs = Date.now();

    if (message.startsWith("tcp connected ")) {
      this.runtimeRepository.update(imei, {
        status: "starting",
        updatedAtMs: timestampMs,
      });
      this.appendLog({
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
      this.runtimeRepository.update(imei, {
        status: "starting",
        updatedAtMs: timestampMs,
      });
      this.appendLog({
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
      this.runtimeRepository.update(imei, {
        status: "reconnecting",
        updatedAtMs: timestampMs,
      });
      this.appendLog({
        imei,
        severity: "warn",
        type: "reconnectAttempted",
        message,
        timestampMs,
      });
      return;
    }

    if (message.startsWith("shutdown ")) {
      this.appendLog({
        imei,
        severity: "info",
        type: "simulationStopRequested",
        message,
        timestampMs,
      });
      return;
    }

    if (message.startsWith("imei rejected ")) {
      this.appendLog({
        imei,
        severity: "warn",
        type: "imeiRejected",
        message,
        timestampMs,
      });
      return;
    }

    if (message.startsWith("imei accepted ")) {
      this.runtimeRepository.update(imei, {
        status: "running",
        updatedAtMs: timestampMs,
      });
      this.appendLog({
        imei,
        severity: "info",
        type: "imeiAccepted",
        message,
        timestampMs,
      });
      return;
    }

    if (message.startsWith("avl sent ")) {
      this.runtimeRepository.update(imei, {
        status: "running",
        updatedAtMs: timestampMs,
      });
      this.appendLog({
        imei,
        severity: "info",
        type: "avlPacketSent",
        message,
        timestampMs,
      });

      const ackMatch = /ack=(\d+)/.exec(message);
      if (ackMatch) {
        this.appendLog({
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
      this.runtimeRepository.update(imei, {
        status: "reconnecting",
        updatedAtMs: timestampMs,
      });
      this.appendLog({
        imei,
        severity: "warn",
        type: "reconnectAttempted",
        message,
        timestampMs,
      });
      return;
    }
  }

  private getDeviceOrThrow(imei: string): DashboardDeviceRecord {
    const device = this.deviceRepository.get(imei);
    if (!device) {
      throw new DashboardDomainError(
        "DEVICE_NOT_FOUND",
        `Device not found: ${normalizeImei(imei)}`,
      );
    }

    return device;
  }

  private appendLog(event: Omit<DashboardLogEvent, "id">): DashboardLogEvent {
    return this.logRepository.append({
      id: randomUUID(),
      ...event,
    });
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
