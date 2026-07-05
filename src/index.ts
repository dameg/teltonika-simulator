import { parseConfig } from "./config";
import { createDryRunOutput } from "./dry-run";
import { runMultiDeviceRuntime } from "./multi-device-runtime";

export { helpText, parseConfig } from "./config";
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
export type { LiveSessionLogger, LiveSessionOptions, LiveSessionResult } from "./live-session";
export type {
  MultiDeviceRuntimeDeviceResult,
  MultiDeviceRuntimeOptions,
  MultiDeviceRuntimeResult
} from "./multi-device-runtime";
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

  if (result.config.dryRun) {
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
  } finally {
    cleanupProcessHooks();
  }

  return 0;
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
