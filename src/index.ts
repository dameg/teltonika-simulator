import { parseConfig } from "./config";
import { createDryRunOutput } from "./dry-run";

export { helpText, parseConfig } from "./config";
export { createDryRunOutput, dryRunStartTimestampMs } from "./dry-run";
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

export function runCli(argv = process.argv.slice(2), env = process.env, io: CliIo = process): number {
  const result = parseConfig(argv, env);
  if (result.kind === "help") {
    io.stdout.write(`${result.help}\n`);
    return 0;
  }

  if (!result.config.dryRun) {
    throw new Error("Live TCP runtime is not implemented yet. Use --dry-run.");
  }

  const output = createDryRunOutput(result.config);
  if (output.stderrLines.length > 0) {
    io.stderr.write(`${output.stderrLines.join("\n")}\n`);
  }
  if (output.stdoutLines.length > 0) {
    io.stdout.write(`${output.stdoutLines.join("\n")}\n`);
  }
  return 0;
}

if (require.main === module) {
  try {
    process.exit(runCli());
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
