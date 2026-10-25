export { helpText, parseConfig } from "./config";
export { createDryRunOutput, dryRunStartTimestampMs } from "./dry-run";
export { runLiveSession } from "./live-session";
export { runMultiDeviceRuntime } from "./multi-device-runtime";
export {
  mapVehicleStateToAvlRecord
} from "./avl-mapping";
export {
  defaultCodec8ExtendedDeviceProfile,
  fmc003DeviceProfile,
  fmc150DeviceProfile,
  fmc250DeviceProfile,
  fmc650FmsDeviceProfile,
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
  simulationDeterminismKey,
  simulationSpeedMultiplier
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
  Codec8ExtendedDecodeError,
  Codec8ExtendedDecodeErrorKind,
  Codec8ExtendedDecodeResult,
  DecodedCodec8ExtendedPacket
} from "./codec8-extended-decoder";
export type {
  LiveSessionConfiguration,
  LiveSessionEvent,
  LiveSessionLogger,
  LiveSessionOptions,
  LiveSessionRecordAcceptedContext,
  LiveSessionResult,
} from "./live-session";
export type {
  MultiDeviceRuntimeDeviceResult,
  MultiDeviceRuntimeOptions,
  MultiDeviceRuntimeResult
} from "./multi-device-runtime";
export type { SimulatorConfig } from "./config";
export type {
  DeterministicSimulationContext,
  DeterministicSimulationOptions,
  SeededRandom,
  SimulationClock,
  SimulationClockOptions,
  VehicleSimulator,
  VehicleSimulatorCheckpoint,
  VehicleSimulatorOptions
} from "./simulation";
export { runCli } from "./cli-runner";
export type { CliIo } from "./cli-runner";

export function simulatorName(): string {
  return "teltonika-simulator";
}
