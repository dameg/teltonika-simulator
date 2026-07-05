import type net from "node:net";

import { mapVehicleStateToAvlRecord } from "./avl-mapping";
import { sendAvlPacket } from "./avl-session";
import { getDeviceProfile } from "./device-profile";
import { performImeiHandshake } from "./imei-handshake";
import { resolveSimulationRoute } from "./route";
import { createVehicleSimulator } from "./simulation";
import type { AvlRecord, DrivingStyleName } from "./domain";

export interface LiveSessionLogger {
  info(message: string): void;
  error?(message: string): void;
}

export interface LiveSessionOptions {
  host: string;
  port: number;
  imei: string;
  intervalMs: number;
  reconnectDelayMs?: number;
  routeFile?: string;
  drivingStyle: DrivingStyleName;
  seed: number;
  deviceProfile: string;
  signal?: AbortSignal;
  logger?: LiveSessionLogger;
}

export type LiveSessionResult =
  | { kind: "completed" }
  | { kind: "rejected" };

type ConnectionAttemptResult =
  | { kind: "completed" }
  | { kind: "rejected" }
  | { kind: "reconnect"; pendingRecord: AvlRecord | null };

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
  const route = resolveSimulationRoute(options.routeFile);
  const profile = getDeviceProfile(options.deviceProfile);
  const simulator = createVehicleSimulator({
    route,
    drivingStyle: options.drivingStyle,
    seed: options.seed,
    startTimestampMs: 1_700_000_000_000,
    intervalMs: options.intervalMs,
    externalVoltageMv: profile.defaults.externalVoltageMv,
    batteryVoltageMv: profile.defaults.batteryVoltageMv
  });
  let pendingRecord: AvlRecord | null = null;

  while (true) {
    throwIfAborted(options.signal);

    logger.info(`connect host=${options.host} port=${options.port} imei=${options.imei}`);

    try {
      const result = await runConnectionAttempt(
        { ...options, logger },
        simulator,
        profile,
        pendingRecord
      );
      if (result.kind === "reconnect") {
        pendingRecord = result.pendingRecord;
        logger.info(
          `reconnect delay-ms=${reconnectDelayMs} host=${options.host} port=${options.port} imei=${options.imei}`
        );
        await delayWithAbort(reconnectDelayMs, options.signal);
        continue;
      }

      return result;
    } catch (error) {
      if (isAbortError(error) || options.signal?.aborted) {
        logger.info(`shutdown imei=${options.imei}`);
        return { kind: "completed" };
      }

      logger.error?.(error instanceof Error ? error.message : String(error));
      throw error;
    }
  }
}

async function runConnectionAttempt(
  options: LiveSessionOptions & { logger: LiveSessionLogger },
  simulator: ReturnType<typeof createVehicleSimulator>,
  profile: ReturnType<typeof getDeviceProfile>,
  pendingRecord: AvlRecord | null
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
      signal: options.signal
    });

    if (handshake.kind === "rejected") {
      options.logger.info(`imei rejected imei=${options.imei}`);
      return { kind: "rejected" };
    }

    socket = handshake.socket;
    removeAbortListener = bindAbortSignal(options.signal, () => {
      void closeSocket(handshake.socket);
    });

    options.logger.info(`imei accepted imei=${options.imei}`);

    while (true) {
      throwIfAborted(options.signal);

      const record = pendingRecord ?? mapVehicleStateToAvlRecord(simulator.next(), profile);
      pendingRecord = record;
      const result = await sendAvlPacket(handshake.socket, [record]);
      pendingRecord = null;
      options.logger.info(
        `avl sent imei=${options.imei} records=1 timestamp=${record.timestampMs} ack=${result.acceptedRecordCount}`
      );

      await delayWithAbort(options.intervalMs, options.signal);
    }
  } catch (error) {
    if (isAbortError(error) || options.signal?.aborted) {
      return { kind: "completed" };
    }

    if (isReconnectableSessionError(error)) {
      options.logger.info(
        `connection lost imei=${options.imei} reason=${formatError(error)}`
      );
      return { kind: "reconnect", pendingRecord };
    }

    throw error;
  } finally {
    removeAbortListener();
    if (socket) {
      await closeSocket(socket);
    }
  }
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
