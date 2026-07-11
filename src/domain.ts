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

export interface RouteSegment {
  start: RoutePoint;
  end: RoutePoint;
  distanceMeters: number;
  startDistanceMeters: number;
  endDistanceMeters: number;
  headingDegrees: number;
  speedLimitKph?: number;
}

export interface RouteGeometry {
  route: RouteDefinition;
  segments: readonly RouteSegment[];
  totalDistanceMeters: number;
}

export interface InterpolatedRoutePosition {
  latitude: number;
  longitude: number;
  altitudeMeters: number;
  headingDegrees: number;
  distanceMeters: number;
  segmentIndex: number;
  speedLimitKph?: number;
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
  tripDistanceMeters: number;
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
  | "satellites"
  | "hasGpsFix"
  | "brakeSwitch"
  | "wheelBasedSpeed"
  | "cruiseControlActive"
  | "clutchSwitch"
  | "ptoState"
  | "acceleratorPedalPosition"
  | "engineLoad"
  | "engineTotalFuelUsed"
  | "fuelLevelPercent"
  | "engineRpm"
  | "axleWeight1"
  | "axleWeight2"
  | "axleWeight3"
  | "totalOdometerMeters"
  | "tripDistanceMeters";

export interface DeviceProfileDefaults {
  priority: number;
  externalVoltageMv: number;
  batteryVoltageMv?: number;
}

export interface DeviceIoMappingRule {
  ioId: number;
  source: VehicleStateField | DrivingEventType;
  bytes?: 1 | 2 | 4;
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

export type AvlPriority = 0 | 1 | 2;
export type TeltonikaCoordinate = number;

export interface AvlGpsElement {
  longitude: TeltonikaCoordinate;
  latitude: TeltonikaCoordinate;
  altitudeMeters: number;
  headingDegrees: number;
  satellites: number;
  speedKph: number;
}

export interface AvlIoElement<TValue extends number | bigint | Uint8Array = number | bigint | Uint8Array> {
  id: number;
  value: TValue;
}

export interface AvlIoGroups {
  oneByte: readonly AvlIoElement<number>[];
  twoBytes: readonly AvlIoElement<number>[];
  fourBytes: readonly AvlIoElement<number>[];
  eightBytes: readonly AvlIoElement<bigint>[];
  xBytes: readonly AvlIoElement<Uint8Array>[];
}

export interface AvlRecord {
  timestampMs: number;
  priority: AvlPriority;
  gps: AvlGpsElement;
  eventIoId: number;
  io: AvlIoGroups;
}

export function toTeltonikaLatitude(latitude: number): TeltonikaCoordinate {
  return toTeltonikaCoordinate(latitude, "latitude", -90, 90);
}

export function toTeltonikaLongitude(longitude: number): TeltonikaCoordinate {
  return toTeltonikaCoordinate(longitude, "longitude", -180, 180);
}

function toTeltonikaCoordinate(value: number, label: string, min: number, max: number): TeltonikaCoordinate {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${label} must be between ${min} and ${max} degrees`);
  }

  return Math.round(value * 10_000_000);
}
