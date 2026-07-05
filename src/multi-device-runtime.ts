import {
  runLiveSession,
  type LiveSessionLogger,
  type LiveSessionResult
} from "./live-session";
import type { DrivingStyleName } from "./domain";

export interface MultiDeviceRuntimeOptions {
  host: string;
  port: number;
  imeis: readonly string[];
  intervalMs: number;
  reconnectDelayMs?: number;
  routeFile?: string;
  drivingStyle: DrivingStyleName;
  seed: number;
  deviceProfile: string;
  signal?: AbortSignal;
  logger?: LiveSessionLogger;
}

export type MultiDeviceRuntimeDeviceResult =
  | { imei: string; result: LiveSessionResult }
  | { imei: string; result: { kind: "failed"; error: Error } };

export interface MultiDeviceRuntimeResult {
  devices: MultiDeviceRuntimeDeviceResult[];
}

const defaultLogger: LiveSessionLogger = {
  info() {
    // Intentionally empty.
  }
};

export async function runMultiDeviceRuntime(
  options: MultiDeviceRuntimeOptions
): Promise<MultiDeviceRuntimeResult> {
  const logger = options.logger ?? defaultLogger;
  const devices = await Promise.all(
    options.imeis.map(async (imei): Promise<MultiDeviceRuntimeDeviceResult> => {
      try {
        const result = await runLiveSession({
          host: options.host,
          port: options.port,
          imei,
          intervalMs: options.intervalMs,
          reconnectDelayMs: options.reconnectDelayMs,
          routeFile: options.routeFile,
          drivingStyle: options.drivingStyle,
          seed: deriveDeviceSeed(options.seed, imei),
          deviceProfile: options.deviceProfile,
          signal: options.signal,
          logger
        });

        return { imei, result };
      } catch (error) {
        const normalized = normalizeError(error);
        logger.error?.(
          `device failed imei=${imei} reason=${normalized.message}`
        );

        return {
          imei,
          result: { kind: "failed", error: normalized }
        };
      }
    })
  );

  return { devices };
}

function deriveDeviceSeed(seed: number, imei: string): number {
  let hash = seed >>> 0;

  for (let index = 0; index < imei.length; index += 1) {
    hash = Math.imul(hash ^ imei.charCodeAt(index), 16777619) >>> 0;
  }

  return hash;
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(String(error));
}
