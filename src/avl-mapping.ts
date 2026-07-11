import type { AvlIoElement, AvlIoGroups, AvlPriority, AvlRecord, DeviceProfile, DrivingEventType, VehicleState } from "./domain";
import { toTeltonikaLatitude, toTeltonikaLongitude } from "./domain";

const eventValues = {
  harshAcceleration: 1,
  harshBraking: 2,
  idleStarted: 1,
  idleEnded: 0,
  gpsFixLost: 0,
  gpsFixRestored: 1
} satisfies Record<DrivingEventType, number>;

export function mapVehicleStateToAvlRecord(state: VehicleState, profile: DeviceProfile): AvlRecord {
  const event = state.events.find((candidate) => profile.eventIoIds[candidate.type] !== undefined);
  const oneByte: AvlIoElement<number>[] = [];
  const twoBytes: AvlIoElement<number>[] = [];
  const fourBytes: AvlIoElement<number>[] = [];

  for (const mapping of profile.ioMappings) {
    const value = valueForMapping(state, mapping.source);
    if (value === undefined) {
      continue;
    }
    addNumericIo({ id: mapping.ioId, value }, oneByte, twoBytes, fourBytes, mapping.bytes);
  }

  return {
    timestampMs: state.timestampMs,
    priority: event ? 1 : toPriority(profile.defaults.priority),
    gps: {
      longitude: toTeltonikaLongitude(state.position.longitude),
      latitude: toTeltonikaLatitude(state.position.latitude),
      altitudeMeters: Math.round(state.position.altitudeMeters),
      headingDegrees: Math.round(state.position.headingDegrees),
      satellites: state.position.hasGpsFix ? state.position.satellites : 0,
      speedKph: Math.round(state.speedKph)
    },
    eventIoId: event ? (profile.eventIoIds[event.type] ?? 0) : 0,
    io: {
      oneByte,
      twoBytes,
      fourBytes,
      eightBytes: [],
      xBytes: []
    }
  };
}

function valueForMapping(state: VehicleState, source: DeviceProfile["ioMappings"][number]["source"]): number | undefined {
  switch (source) {
    case "ignitionOn":
      return bool(state.ignitionOn);
    case "movement":
      return bool(state.movement);
    case "externalVoltageMv":
      return state.externalVoltageMv;
    case "batteryVoltageMv":
      return state.batteryVoltageMv;
    case "isIdling":
      return bool(state.isIdling);
    case "satellites":
      return state.position.hasGpsFix ? state.position.satellites : 0;
    case "hasGpsFix":
      return bool(state.position.hasGpsFix);
    case "brakeSwitch":
      return bool(state.brakingMps2 > 0.1);
    case "wheelBasedSpeed":
      return Math.round(state.speedKph);
    case "cruiseControlActive":
      return bool(state.speedKph >= 45 && Math.abs(state.accelerationMps2) < 0.2);
    case "clutchSwitch":
      return bool(state.movement && Math.abs(state.accelerationMps2) > 1);
    case "ptoState":
      return 0;
    case "acceleratorPedalPosition":
      return clamp(Math.round(12 + state.speedKph * 0.7 + Math.max(0, state.accelerationMps2) * 15), 0, 100);
    case "engineLoad":
      return clamp(Math.round(20 + state.speedKph * 0.8 + Math.max(0, state.accelerationMps2) * 18), 0, 100);
    case "engineTotalFuelUsed":
      return 25_000 + Math.floor(state.tripDistanceMeters / 3_000);
    case "fuelLevelPercent":
      return clamp(78 - Math.floor(state.tripDistanceMeters / 6_000), 0, 100);
    case "engineRpm":
      return state.isIdling ? 650 : clamp(Math.round(800 + state.speedKph * 32 + Math.max(0, state.accelerationMps2) * 140), 650, 2_500);
    case "axleWeight1":
      return 5_200;
    case "axleWeight2":
      return 7_800;
    case "axleWeight3":
      return 7_600;
    case "totalOdometerMeters":
      return 500_000_000 + Math.floor(state.tripDistanceMeters);
    case "tripDistanceMeters":
      return Math.floor(state.tripDistanceMeters);
    default:
      return eventValue(state, source);
  }
}

function eventValue(state: VehicleState, type: DrivingEventType): number | undefined {
  return state.events.some((event) => event.type === type) ? eventValues[type] : undefined;
}

function addNumericIo(
  element: AvlIoElement<number>,
  oneByte: AvlIoElement<number>[],
  twoBytes: AvlIoElement<number>[],
  fourBytes: AvlIoElement<number>[],
  bytes?: 1 | 2 | 4
): void {
  if (!Number.isSafeInteger(element.value) || element.value < 0 || element.value > 0xffffffff) {
    throw new RangeError(`IO value for ${element.id} must be an unsigned 32-bit integer`);
  }
  const size = bytes ?? (element.value <= 0xff ? 1 : element.value <= 0xffff ? 2 : 4);
  const max = size === 1 ? 0xff : size === 2 ? 0xffff : 0xffffffff;
  if (element.value > max) {
    throw new RangeError(`IO value for ${element.id} does not fit in ${size} byte(s)`);
  }
  if (size === 1) {
    oneByte.push(element);
  } else if (size === 2) {
    twoBytes.push(element);
  } else {
    fourBytes.push(element);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function bool(value: boolean): number {
  return value ? 1 : 0;
}

function toPriority(value: number): AvlPriority {
  if (value === 0 || value === 1 || value === 2) {
    return value;
  }
  throw new RangeError("device profile default priority must be 0, 1, or 2");
}
