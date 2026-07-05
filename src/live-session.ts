import type net from "node:net";

import { mapVehicleStateToAvlRecord } from "./avl-mapping";
import { sendAvlPacket } from "./avl-session";
import { getDeviceProfile } from "./device-profile";
import { performImeiHandshake } from "./imei-handshake";
import { resolveSimulationRoute } from "./route";
import { createVehicleSimulator } from "./simulation";
import type { DrivingStyleName } from "./domain";

export interface LiveSessionLogger {
  info(message: string): void;
  error?(message: string): void;
}

export interface LiveSessionOptions {
  host: string;
  port: number;
  imei: string;
  intervalMs: number;
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

const defaultLogger: LiveSessionLogger = {
  info() {
    // Intentionally empty.
  }
};

export async function runLiveSession(options: LiveSessionOptions): Promise<LiveSessionResult> {
  throwIfAborted(options.signal);

  const logger = options.logger ?? defaultLogger;
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

  logger.info(`connect host=${options.host} port=${options.port} imei=${options.imei}`);
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
      logger.info(`imei rejected imei=${options.imei}`);
      return { kind: "rejected" };
    }

    const acceptedSocket = handshake.socket;
    socket = acceptedSocket;
    removeAbortListener = bindAbortSignal(options.signal, () => {
      void closeSocket(acceptedSocket);
    });

    logger.info(`imei accepted imei=${options.imei}`);

    while (true) {
      throwIfAborted(options.signal);

      const record = mapVehicleStateToAvlRecord(simulator.next(), profile);
      const result = await sendAvlPacket(acceptedSocket, [record]);
      logger.info(
        `packet sent imei=${options.imei} timestampMs=${record.timestampMs} ack=${result.acceptedRecordCount}`
      );

      await delayWithAbort(options.intervalMs, options.signal);
    }
  } catch (error) {
    if (isAbortError(error) || options.signal?.aborted) {
      logger.info(`shutdown imei=${options.imei}`);
      return { kind: "completed" };
    }
    logger.error?.(error instanceof Error ? error.message : String(error));
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
