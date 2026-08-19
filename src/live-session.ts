import type net from "node:net";

import { mapVehicleStateToAvlRecord } from "./avl-mapping";
import { sendAvlPacket } from "./avl-session";
import { getDeviceProfile } from "./device-profile";
import { performImeiHandshake } from "./imei-handshake";
import { resolveSimulationRoute } from "./route";
import {
  createVehicleSimulator,
  type VehicleSimulator,
  type VehicleSimulatorCheckpoint
} from "./simulation";
import type { AvlRecord, DrivingStyleName } from "./domain";

export interface LiveSessionLogger {
  info(message: string): void | Promise<void>;
  error?(message: string): void | Promise<void>;
}

export interface LiveSessionOptions {
  host: string;
  port: number;
  imei: string;
  intervalMs: number;
  simulationSpeed?: number;
  reconnectDelayMs?: number;
  routeFile?: string;
  drivingStyle: DrivingStyleName;
  seed: number;
  deviceProfile: string;
  packetCount?: number;
  checkpoint?: VehicleSimulatorCheckpoint;
  acceptedRecordCount?: number;
  signal?: AbortSignal;
  logger?: LiveSessionLogger;
  getCurrentConfiguration?: () => Partial<LiveSessionConfiguration>;
  onRecordAccepted?: (
    record: AvlRecord,
    packetHex: string,
    context: LiveSessionRecordAcceptedContext
  ) => void | Promise<void>;
}

export interface LiveSessionConfiguration {
  intervalMs: number;
  simulationSpeed?: number;
  drivingStyle: DrivingStyleName;
  seed: number;
  deviceProfile: string;
  packetCount?: number;
  configRevision?: number;
}

export interface LiveSessionRecordAcceptedContext {
  checkpoint: VehicleSimulatorCheckpoint;
  acceptedRecordCount: number;
  configuration: Readonly<LiveSessionConfiguration>;
}

export type LiveSessionResult =
  | { kind: "completed" }
  | { kind: "rejected" };

type ConnectionAttemptResult =
  | { kind: "completed" }
  | { kind: "rejected" }
  | { kind: "reconnect" };

interface PendingRecord {
  record: AvlRecord;
  checkpoint: VehicleSimulatorCheckpoint;
  configuration: LiveSessionConfiguration;
}

interface LiveSessionState {
  simulator: VehicleSimulator;
  profile: ReturnType<typeof getDeviceProfile>;
  configuration: LiveSessionConfiguration;
  pendingRecord: PendingRecord | null;
  acceptedRecordCount: number;
}

const defaultLogger: LiveSessionLogger = {
  info() {
    // Intentionally empty.
  }
};

const reconnectableErrorCodes = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
  "ETIMEDOUT"
]);

export async function runLiveSession(options: LiveSessionOptions): Promise<LiveSessionResult> {
  throwIfAborted(options.signal);

  const logger = options.logger ?? defaultLogger;
  const reconnectDelayMs = options.reconnectDelayMs ?? 5_000;
  const initialConfiguration = readCurrentConfiguration(options, {
    intervalMs: options.intervalMs,
    simulationSpeed: options.simulationSpeed,
    drivingStyle: options.drivingStyle,
    seed: options.seed,
    deviceProfile: options.deviceProfile,
    packetCount: options.packetCount
  });
  const route = resolveSimulationRoute(options.routeFile, initialConfiguration.seed);
  const profile = getDeviceProfile(initialConfiguration.deviceProfile);
  const simulator = createVehicleSimulator({
    route,
    drivingStyle: initialConfiguration.drivingStyle,
    seed: initialConfiguration.seed,
    startTimestampMs: 1_700_000_000_000,
    intervalMs: initialConfiguration.intervalMs,
    simulationSpeed: initialConfiguration.simulationSpeed,
    externalVoltageMv: profile.defaults.externalVoltageMv,
    batteryVoltageMv: profile.defaults.batteryVoltageMv,
    checkpoint: options.checkpoint
  });
  const sessionState: LiveSessionState = {
    simulator,
    profile,
    configuration: initialConfiguration,
    pendingRecord: null,
    acceptedRecordCount: integerAtLeast(options.acceptedRecordCount ?? 0, "acceptedRecordCount", 0)
  };

  if (hasReachedPacketLimit(sessionState)) {
    return { kind: "completed" };
  }

  while (true) {
    throwIfAborted(options.signal);

    await logger.info(`connect host=${options.host} port=${options.port} imei=${options.imei}`);

    try {
      const result = await runConnectionAttempt(
        { ...options, logger },
        sessionState,
      );
      if (result.kind === "reconnect") {
        await logger.info(
          `reconnect delay-ms=${reconnectDelayMs} host=${options.host} port=${options.port} imei=${options.imei}`
        );
        await delayWithAbort(reconnectDelayMs, options.signal);
        continue;
      }

      return result;
    } catch (error) {
      if (isAbortError(error) || options.signal?.aborted) {
        await logger.info(`shutdown imei=${options.imei}`);
        return { kind: "completed" };
      }

      await logger.error?.(error instanceof Error ? error.message : String(error));
      throw error;
    }
  }
}

async function runConnectionAttempt(
  options: LiveSessionOptions & { logger: LiveSessionLogger },
  sessionState: LiveSessionState,
): Promise<ConnectionAttemptResult> {
  let socket: net.Socket | undefined;
  let removeAbortListener = () => {
    // Nothing to clean up.
  };

  try {
    const handshake = await performImeiHandshake({
      host: options.host,
      port: options.port,
      imei: options.imei,
      signal: options.signal,
      onConnected: () =>
        options.logger.info(
          `tcp connected host=${options.host} port=${options.port} imei=${options.imei}`
        ),
      onImeiSent: () => options.logger.info(`imei sent imei=${options.imei}`),
    });

    if (handshake.kind === "rejected") {
      await options.logger.info(`imei rejected imei=${options.imei}`);
      return { kind: "rejected" };
    }

    socket = handshake.socket;
    removeAbortListener = bindAbortSignal(options.signal, () => {
      void closeSocket(handshake.socket);
    });

    await options.logger.info(`imei accepted imei=${options.imei}`);

    while (true) {
      throwIfAborted(options.signal);

      if (!sessionState.pendingRecord) {
        applyCurrentConfiguration(options, sessionState);
        if (hasReachedPacketLimit(sessionState)) {
          return { kind: "completed" };
        }

        const record = mapVehicleStateToAvlRecord(
          sessionState.simulator.next(),
          sessionState.profile
        );
        sessionState.pendingRecord = {
          record,
          checkpoint: sessionState.simulator.getCheckpoint(),
          configuration: { ...sessionState.configuration }
        };
      }

      const pendingRecord = sessionState.pendingRecord;
      const result = await sendAvlPacket(handshake.socket, [pendingRecord.record]);
      sessionState.acceptedRecordCount += result.acceptedRecordCount;
      sessionState.pendingRecord = null;
      await options.onRecordAccepted?.(pendingRecord.record, result.packetHex, {
        checkpoint: pendingRecord.checkpoint,
        acceptedRecordCount: sessionState.acceptedRecordCount,
        configuration: { ...pendingRecord.configuration }
      });
      await options.logger.info(
        `avl sent imei=${options.imei} records=1 timestamp=${pendingRecord.record.timestampMs} ack=${result.acceptedRecordCount}`
      );
      applyCurrentConfiguration(options, sessionState);
      if (hasReachedPacketLimit(sessionState)) {
        return { kind: "completed" };
      }

      await delayWithAbort(sessionState.configuration.intervalMs, options.signal);
    }
  } catch (error) {
    if (isAbortError(error) || options.signal?.aborted) {
      return { kind: "completed" };
    }

    if (isReconnectableSessionError(error)) {
      await options.logger.info(
        `connection lost imei=${options.imei} reason=${formatError(error)}`
      );
      return { kind: "reconnect" };
    }

    throw error;
  } finally {
    removeAbortListener();
    if (socket) {
      await closeSocket(socket);
    }
  }
}

function applyCurrentConfiguration(
  options: LiveSessionOptions,
  sessionState: LiveSessionState
): void {
  const nextConfiguration = readCurrentConfiguration(options, sessionState.configuration);
  const nextProfile = getDeviceProfile(nextConfiguration.deviceProfile);

  sessionState.simulator.updateConfiguration({
    intervalMs: nextConfiguration.intervalMs,
    simulationSpeed: nextConfiguration.simulationSpeed ?? 0,
    drivingStyle: nextConfiguration.drivingStyle,
    seed: nextConfiguration.seed,
    externalVoltageMv: nextProfile.defaults.externalVoltageMv,
    batteryVoltageMv: nextProfile.defaults.batteryVoltageMv
  });
  sessionState.profile = nextProfile;
  sessionState.configuration = nextConfiguration;
}

function readCurrentConfiguration(
  options: LiveSessionOptions,
  current: LiveSessionConfiguration
): LiveSessionConfiguration {
  const update = options.getCurrentConfiguration?.() ?? {};
  const configuration = { ...current, ...update };

  integerAtLeast(configuration.intervalMs, "intervalMs", 1);
  if (configuration.simulationSpeed !== undefined) {
    if (!Number.isInteger(configuration.simulationSpeed) || configuration.simulationSpeed < -10 || configuration.simulationSpeed > 10) {
      throw new RangeError("simulationSpeed must be an integer between -10 and 10");
    }
  }
  if (!Number.isSafeInteger(configuration.seed)) {
    throw new Error("seed must be a safe integer");
  }
  if (configuration.packetCount !== undefined) {
    integerAtLeast(configuration.packetCount, "packetCount", 1);
  }
  if (configuration.configRevision !== undefined) {
    integerAtLeast(configuration.configRevision, "configRevision", 1);
  }
  getDeviceProfile(configuration.deviceProfile);

  return configuration;
}

function hasReachedPacketLimit(state: LiveSessionState): boolean {
  return state.configuration.packetCount !== undefined &&
    state.acceptedRecordCount >= state.configuration.packetCount;
}

function integerAtLeast(value: number, name: string, min: number): number {
  if (!Number.isSafeInteger(value) || value < min) {
    throw new Error(`${name} must be an integer greater than or equal to ${min}`);
  }
  return value;
}

function bindAbortSignal(signal: AbortSignal | undefined, onAbort: () => void): () => void {
  if (!signal) {
    return () => {
      // Nothing to clean up.
    };
  }
  if (signal.aborted) {
    onAbort();
    return () => {
      // Nothing to clean up.
    };
  }

  signal.addEventListener("abort", onAbort, { once: true });
  return () => {
    signal.removeEventListener("abort", onAbort);
  };
}

async function delayWithAbort(delayMs: number, signal: AbortSignal | undefined): Promise<void> {
  throwIfAborted(signal);

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, delayMs);

    const onAbort = () => {
      cleanup();
      reject(createAbortError());
    };

    signal?.addEventListener("abort", onAbort, { once: true });

    function cleanup() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  });
}

async function closeSocket(socket: net.Socket): Promise<void> {
  if (socket.destroyed) {
    return;
  }

  await new Promise<void>((resolve) => {
    socket.once("close", () => resolve());
    socket.end();
    socket.destroySoon();
  });
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function createAbortError(): Error {
  const error = new Error("Session aborted.");
  error.name = "AbortError";
  return error;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function isReconnectableSessionError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  if (isAvlAcknowledgementMismatchError(error)) {
    return false;
  }

  const code = "code" in error ? error.code : undefined;
  if (typeof code === "string" && reconnectableErrorCodes.has(code)) {
    return true;
  }

  return (
    error.message === "Socket closed before IMEI acknowledgement was received." ||
    error.message === "Socket is not writable for AVL packet send." ||
    error.message === "Socket closed while sending AVL packet." ||
    error.message === "Socket closed before AVL acknowledgement was received."
  );
}

function isAvlAcknowledgementMismatchError(error: Error): boolean {
  return error.message.startsWith("AVL acknowledgement count mismatch:");
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
