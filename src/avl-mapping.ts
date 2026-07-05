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
    addNumericIo({ id: mapping.ioId, value }, oneByte, twoBytes, fourBytes);
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
  fourBytes: AvlIoElement<number>[]
): void {
  if (!Number.isSafeInteger(element.value) || element.value < 0 || element.value > 0xffffffff) {
    throw new RangeError(`IO value for ${element.id} must be an unsigned 32-bit integer`);
  }
  if (element.value <= 0xff) {
    oneByte.push(element);
  } else if (element.value <= 0xffff) {
    twoBytes.push(element);
  } else {
    fourBytes.push(element);
  }
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
