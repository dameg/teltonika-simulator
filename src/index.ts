import { parseConfig } from "./config";
import { startDashboardBackend } from "./dashboard-backend";
import { createDryRunOutput } from "./dry-run";
import { runMultiDeviceRuntime } from "./multi-device-runtime";

export { helpText, parseConfig } from "./config";
export { startDashboardBackend } from "./dashboard-backend";
export { createDryRunOutput, dryRunStartTimestampMs } from "./dry-run";
export { runLiveSession } from "./live-session";
export { runMultiDeviceRuntime } from "./multi-device-runtime";
export {
  mapVehicleStateToAvlRecord
} from "./avl-mapping";
export {
  defaultCodec8ExtendedDeviceProfile,
  deviceProfiles,
  getDeviceProfile,
  validateDeviceProfile
} from "./device-profile";
export { drivingStyleProfiles, getDrivingStyleProfile, parseDrivingStyleName } from "./driving-style";
export {
  createDeterministicSimulationContext,
  createSeededRandom,
  createSimulationClock,
  createVehicleSimulator,
  simulationDeterminismKey
} from "./simulation";
export { toTeltonikaLatitude, toTeltonikaLongitude } from "./domain";
export {
  buildRouteGeometry,
  generatedTelemetryFallbackRoute,
  interpolateRoutePosition,
  interpolateRouteProgress,
  loadRouteFromFile,
  parseRouteDefinition,
  resolveSimulationRoute
} from "./route";
export { crc16Ibm, crc16IbmProtocolField } from "./codec-crc";
export { encodeCodec8ExtendedPacket, encodeCodec8ExtendedRecord } from "./codec8-extended";
export { decodeCodec8ExtendedPacket } from "./codec8-extended-decoder";
export { encodeImeiHandshakeFrame, performImeiHandshake } from "./imei-handshake";
export { sendAvlPacket } from "./avl-session";
export type {
  AvlGpsElement,
  AvlIoElement,
  AvlIoGroups,
  AvlPriority,
  AvlRecord,
  CodecName,
  DeviceIoMappingRule,
  DeviceProfile,
  DeviceProfileDefaults,
  DrivingEvent,
  DrivingEventType,
  DrivingStyleName,
  DrivingStyleProfile,
  InterpolatedRoutePosition,
  RouteDefinition,
  RouteGeometry,
  RouteMetadata,
  RoutePoint,
  RouteSegment,
  TeltonikaCoordinate,
  VehiclePosition,
  VehicleState,
  VehicleStateField
} from "./domain";
export type { ImeiHandshakeOptions, ImeiHandshakeResult } from "./imei-handshake";
export type { AvlPacketSendResult } from "./avl-session";
export type {
  DashboardBackend,
  DashboardAvlMessage,
  DashboardErrorMessage,
  DashboardImeiMessage,
  DashboardMessage,
  DashboardMessageBase
} from "./dashboard-backend";
export type {
  Codec8ExtendedDecodeError,
  Codec8ExtendedDecodeErrorKind,
  Codec8ExtendedDecodeResult,
  DecodedCodec8ExtendedPacket
} from "./codec8-extended-decoder";
export type { LiveSessionLogger, LiveSessionOptions, LiveSessionResult } from "./live-session";
export type {
  MultiDeviceRuntimeDeviceResult,
  MultiDeviceRuntimeOptions,
  MultiDeviceRuntimeResult
} from "./multi-device-runtime";
export type { DashboardConfig, SimulatorConfig } from "./config";
export type {
  DeterministicSimulationContext,
  DeterministicSimulationOptions,
  SeededRandom,
  SimulationClock,
  SimulationClockOptions,
  VehicleSimulator,
  VehicleSimulatorOptions
} from "./simulation";

export function simulatorName(): string {
  return "teltonika-simulator";
}

export function formatAddressPort(address: { address: string; port: number }): string {
  const host = address.address.includes(":") ? `[${address.address}]` : address.address;

  return `${host}:${address.port}`;
}

export function formatHttpUrl(address: { address: string; port: number }): string {
  return `http://${formatAddressPort(address)}/`;
}

export interface CliIo {
  stdout: Pick<NodeJS.WriteStream, "write">;
  stderr: Pick<NodeJS.WriteStream, "write">;
}

export async function runCli(argv = process.argv.slice(2), env = process.env, io: CliIo = process): Promise<number> {
  const result = parseConfig(argv, env);
  if (result.kind === "help") {
    io.stdout.write(`${result.help}\n`);
    return 0;
  }

  if (result.kind === "simulator" && result.config.dryRun) {
    const output = createDryRunOutput(result.config);
    if (output.stderrLines.length > 0) {
      io.stderr.write(`${output.stderrLines.join("\n")}\n`);
    }
    if (output.stdoutLines.length > 0) {
      io.stdout.write(`${output.stdoutLines.join("\n")}\n`);
    }
    return 0;
  }

  const controller = new AbortController();
  const cleanupProcessHooks = registerTerminationHooks(controller);

  try {
    if (result.kind === "dashboard") {
      const backend = await startDashboardBackend(result.config);
      io.stdout.write(`Teltonika TCP listener: ${formatAddressPort(backend.tcpAddress)}\n`);
      io.stdout.write(`Dashboard URL: ${formatHttpUrl(backend.webAddress)}\n`);

      try {
        await waitForAbort(controller.signal);
      } finally {
        await backend.close();
      }
    } else {
      await runMultiDeviceRuntime({
        host: result.config.host,
        port: result.config.port,
        imeis: result.config.imeis,
        intervalMs: result.config.intervalMs,
        reconnectDelayMs: result.config.reconnectDelayMs,
        routeFile: result.config.routeFile,
        drivingStyle: result.config.drivingStyle,
        seed: result.config.seed,
        deviceProfile: result.config.deviceProfile,
        signal: controller.signal,
        logger: {
          info(message) {
            io.stderr.write(`${message}\n`);
          },
          error(message) {
            io.stderr.write(`${message}\n`);
          }
        }
      });
    }
  } finally {
    cleanupProcessHooks();
  }

  return 0;
}

function waitForAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
}

if (require.main === module) {
  void runCli().then(
    (exitCode) => {
      process.exit(exitCode);
    },
    (error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
    }
  );
}

function registerTerminationHooks(controller: AbortController): () => void {
  const abort = () => {
    controller.abort();
  };

  process.once("SIGINT", abort);
  process.once("SIGTERM", abort);

  return () => {
    process.off("SIGINT", abort);
    process.off("SIGTERM", abort);
  };
}
