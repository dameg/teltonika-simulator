export { helpText, parseConfig } from "./config";
export { startDashboardBackend } from "./dashboard-backend";
export type {
  FrameDecodeFailureInput,
  FrameIngestInput,
  FrameIngestStore,
} from "./frame-ingest-store";
export {
  DatabaseModule,
  DatabaseService,
  PostgresFrameStore,
  PostgresDashboardStore,
} from "./dashboard/persistence";
export {
  InMemoryDashboardConfigRevisionRepository,
  InMemoryDashboardDeviceRepository,
  InMemoryDashboardJourneyRepository,
  InMemoryDashboardLogRepository,
  InMemoryDashboardPositionRepository,
  InMemoryDashboardRuntimeRepository,
} from "./dashboard/repositories";
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
export type { DashboardConfig, SimulatorConfig } from "./config";
export type {
  DashboardDeviceConfig,
  DashboardConfigRevision,
  DashboardDeviceRecord,
  DashboardDomainErrorCode,
  DashboardLogContextValue,
  DashboardLogEvent,
  DashboardLogEventType,
  DashboardLogSeverity,
  DashboardPosition,
  DashboardTelemetryField,
  DashboardTelemetryGroup,
  DashboardTelemetrySnapshot,
  DashboardTelemetryValue,
  DashboardRunOverview,
  DashboardRunRecord,
  DashboardRunStatus,
} from "./dashboard/domain";
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
export {
  DashboardDomainError,
  assertUniqueImei,
  findDuplicateImeis,
  normalizeImei,
} from "./dashboard/domain";
export { createDashboardApp, startDashboardServer, type DashboardServer } from "./dashboard/main";
export { runCli } from "./cli-runner";
export type { CliIo } from "./cli-runner";

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
