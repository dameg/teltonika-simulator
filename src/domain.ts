export type DrivingStyleName = "eco" | "normal" | "aggressive";

export interface RouteMetadata {
  id: string;
  name?: string;
  description?: string;
}

export interface RoutePoint {
  latitude: number;
  longitude: number;
  altitudeMeters?: number;
  speedLimitKph?: number;
  stopDurationMs?: number;
}

export interface RouteDefinition {
  metadata: RouteMetadata;
  points: readonly RoutePoint[];
}

export interface DrivingStyleProfile {
  name: DrivingStyleName;
  targetAccelerationMps2: number;
  brakingIntensityMps2: number;
  speedVariationRatio: number;
  idleProbability: number;
  corneringSlowdownRatio: number;
  harshAccelerationProbability: number;
  harshBrakingProbability: number;
}

export type DrivingEventType = "harshAcceleration" | "harshBraking" | "idleStarted" | "idleEnded" | "gpsFixLost" | "gpsFixRestored";

export interface DrivingEvent {
  type: DrivingEventType;
  timestampMs: number;
}

export interface VehiclePosition {
  latitude: number;
  longitude: number;
  altitudeMeters: number;
  headingDegrees: number;
  satellites: number;
  hasGpsFix: boolean;
}

export interface VehicleState {
  timestampMs: number;
  position: VehiclePosition;
  speedKph: number;
  accelerationMps2: number;
  brakingMps2: number;
  isStopped: boolean;
  isIdling: boolean;
  ignitionOn: boolean;
  movement: boolean;
  externalVoltageMv: number;
  batteryVoltageMv?: number;
  events: readonly DrivingEvent[];
}

export type CodecName = "codec8e";
export type VehicleStateField =
  | "ignitionOn"
  | "movement"
  | "externalVoltageMv"
  | "batteryVoltageMv"
  | "isIdling"
  | "hasGpsFix";

export interface DeviceProfileDefaults {
  priority: number;
  externalVoltageMv: number;
  batteryVoltageMv?: number;
}

export interface DeviceIoMappingRule {
  ioId: number;
  source: VehicleStateField | DrivingEventType;
}

export interface DeviceProfile {
  name: string;
  modelName: string;
  codec: CodecName;
  supportedIoIds: readonly number[];
  defaults: DeviceProfileDefaults;
  ioMappings: readonly DeviceIoMappingRule[];
  eventIoIds: Partial<Record<DrivingEventType, number>>;
}
