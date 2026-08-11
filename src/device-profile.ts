import type { CodecName, DeviceIoMappingRule, DeviceProfile, DrivingEventType, VehicleStateField } from "./domain";

const codec8Extended: CodecName = "codec8e";
const commonCodec8ExtendedIoMappings = [
  { ioId: 239, source: "ignitionOn", bytes: 1 },
  { ioId: 240, source: "movement", bytes: 1 },
  { ioId: 66, source: "externalVoltageMv", bytes: 2 },
  { ioId: 67, source: "batteryVoltageMv", bytes: 2 },
  { ioId: 69, source: "hasGpsFix", bytes: 1 },
  { ioId: 251, source: "isIdling", bytes: 1 },
  { ioId: 253, source: "harshAcceleration", bytes: 1 },
  { ioId: 253, source: "harshBraking", bytes: 1 }
] satisfies readonly DeviceIoMappingRule[];

const defaultCodec8ExtendedEventIoIds = {
  harshAcceleration: 253,
  harshBraking: 253,
  idleStarted: 251,
  gpsFixLost: 69,
  gpsFixRestored: 69
} satisfies Partial<Record<DrivingEventType, number>>;

const fmc003Fmc150AndFmc250EventIoIds = {
  ...defaultCodec8ExtendedEventIoIds,
  idleEnded: 251
} satisfies Partial<Record<DrivingEventType, number>>;

const fmc150AndFmc250CanIoMappings = [
  { ioId: 81, source: "wheelBasedSpeed", bytes: 1 },
  { ioId: 82, source: "acceleratorPedalPosition", bytes: 1 },
  { ioId: 83, source: "engineTotalFuelUsed", bytes: 4 },
  { ioId: 85, source: "engineRpm", bytes: 2 },
  { ioId: 87, source: "totalOdometerMeters", bytes: 4 },
  { ioId: 89, source: "fuelLevelPercent", bytes: 1 },
  { ioId: 118, source: "axleWeight1", bytes: 2 },
  { ioId: 119, source: "axleWeight2", bytes: 2 },
  { ioId: 120, source: "axleWeight3", bytes: 2 },
  { ioId: 910, source: "brakeSwitch", bytes: 1 },
  { ioId: 911, source: "clutchSwitch", bytes: 1 },
  { ioId: 937, source: "cruiseControlActive", bytes: 1 },
  { ioId: 946, source: "ptoState", bytes: 1 }
] satisfies readonly DeviceIoMappingRule[];
const validSources = new Set<VehicleStateField | DrivingEventType>([
  "ignitionOn",
  "movement",
  "externalVoltageMv",
  "batteryVoltageMv",
  "isIdling",
  "satellites",
  "hasGpsFix",
  "brakeSwitch",
  "wheelBasedSpeed",
  "cruiseControlActive",
  "clutchSwitch",
  "ptoState",
  "acceleratorPedalPosition",
  "engineLoad",
  "engineTotalFuelUsed",
  "fuelLevelPercent",
  "engineRpm",
  "axleWeight1",
  "axleWeight2",
  "axleWeight3",
  "totalOdometerMeters",
  "tripDistanceMeters",
  "harshAcceleration",
  "harshBraking",
  "idleStarted",
  "idleEnded",
  "gpsFixLost",
  "gpsFixRestored"
]);

export const defaultCodec8ExtendedDeviceProfile = {
  name: "default-codec8e",
  modelName: "Default Codec 8 Extended",
  codec: codec8Extended,
  supportedIoIds: [66, 67, 69, 239, 240, 251, 253],
  defaults: {
    priority: 0,
    externalVoltageMv: 13_800,
    batteryVoltageMv: 4_100
  },
  ioMappings: commonCodec8ExtendedIoMappings,
  eventIoIds: defaultCodec8ExtendedEventIoIds
} satisfies DeviceProfile;

export const fmc003DeviceProfile = {
  ...defaultCodec8ExtendedDeviceProfile,
  name: "fmc003",
  modelName: "Teltonika FMC003",
  supportedIoIds: [12, 16, 31, 36, 37, 41, 48, 66, 67, 69, 199, 239, 240, 251, 253],
  ioMappings: [
    ...commonCodec8ExtendedIoMappings,
    { ioId: 12, source: "engineTotalFuelUsed", bytes: 4 },
    { ioId: 16, source: "totalOdometerMeters", bytes: 4 },
    { ioId: 31, source: "engineLoad", bytes: 1 },
    { ioId: 36, source: "engineRpm", bytes: 2 },
    { ioId: 37, source: "wheelBasedSpeed", bytes: 1 },
    { ioId: 41, source: "acceleratorPedalPosition", bytes: 1 },
    { ioId: 48, source: "fuelLevelPercent", bytes: 1 },
    { ioId: 199, source: "tripDistanceMeters", bytes: 4 }
  ],
  eventIoIds: fmc003Fmc150AndFmc250EventIoIds
} satisfies DeviceProfile;

export const fmc150DeviceProfile = {
  ...defaultCodec8ExtendedDeviceProfile,
  name: "fmc150",
  modelName: "Teltonika FMC150",
  supportedIoIds: [66, 67, 69, 81, 82, 83, 85, 87, 89, 118, 119, 120, 239, 240, 251, 253, 910, 911, 937, 946],
  ioMappings: [...commonCodec8ExtendedIoMappings, ...fmc150AndFmc250CanIoMappings],
  eventIoIds: fmc003Fmc150AndFmc250EventIoIds
} satisfies DeviceProfile;

export const fmc250DeviceProfile = {
  ...defaultCodec8ExtendedDeviceProfile,
  name: "fmc250",
  modelName: "Teltonika FMC250",
  supportedIoIds: [66, 67, 69, 81, 82, 83, 85, 87, 89, 118, 119, 120, 239, 240, 251, 253, 910, 911, 937, 946],
  ioMappings: [...commonCodec8ExtendedIoMappings, ...fmc150AndFmc250CanIoMappings],
  eventIoIds: fmc003Fmc150AndFmc250EventIoIds
} satisfies DeviceProfile;

export const fmc650FmsDeviceProfile = {
  ...defaultCodec8ExtendedDeviceProfile,
  name: "fmc650-fms",
  modelName: "Teltonika FMC650 FMS/J1939",
  supportedIoIds: [66, 67, 69, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 192, 193, 239, 240, 251, 253],
  ioMappings: [
    ...defaultCodec8ExtendedDeviceProfile.ioMappings,
    { ioId: 79, source: "brakeSwitch", bytes: 1 },
    { ioId: 80, source: "wheelBasedSpeed", bytes: 4 },
    { ioId: 81, source: "cruiseControlActive", bytes: 1 },
    { ioId: 82, source: "clutchSwitch", bytes: 1 },
    { ioId: 83, source: "ptoState", bytes: 1 },
    { ioId: 84, source: "acceleratorPedalPosition", bytes: 4 },
    { ioId: 85, source: "engineLoad", bytes: 1 },
    { ioId: 86, source: "engineTotalFuelUsed", bytes: 4 },
    { ioId: 87, source: "fuelLevelPercent", bytes: 4 },
    { ioId: 88, source: "engineRpm", bytes: 4 },
    { ioId: 89, source: "axleWeight1", bytes: 2 },
    { ioId: 90, source: "axleWeight2", bytes: 2 },
    { ioId: 91, source: "axleWeight3", bytes: 2 },
    { ioId: 192, source: "totalOdometerMeters", bytes: 4 },
    { ioId: 193, source: "tripDistanceMeters", bytes: 4 },
  ],
} satisfies DeviceProfile;

export const deviceProfiles = {
  [defaultCodec8ExtendedDeviceProfile.name]: defaultCodec8ExtendedDeviceProfile,
  [fmc003DeviceProfile.name]: fmc003DeviceProfile,
  [fmc150DeviceProfile.name]: fmc150DeviceProfile,
  [fmc250DeviceProfile.name]: fmc250DeviceProfile,
  [fmc650FmsDeviceProfile.name]: fmc650FmsDeviceProfile,
} satisfies Record<string, DeviceProfile>;

export function getDeviceProfile(name: string): DeviceProfile {
  const profile = deviceProfiles[name];
  if (!profile) {
    throw new Error(`Unknown device profile: ${name}`);
  }
  return profile;
}

export function validateDeviceProfile(profile: DeviceProfile): DeviceProfile {
  if (!profile.name.trim()) {
    throw new Error("device profile name must be a non-empty string");
  }
  if (!profile.modelName.trim()) {
    throw new Error("device profile modelName must be a non-empty string");
  }
  if (profile.codec !== "codec8e") {
    throw new Error("device profile codec must be codec8e");
  }
  if (![0, 1, 2].includes(profile.defaults.priority)) {
    throw new Error("device profile default priority must be 0, 1, or 2");
  }
  assertVoltage(profile.defaults.externalVoltageMv, "externalVoltageMv");
  if (profile.defaults.batteryVoltageMv !== undefined) {
    assertVoltage(profile.defaults.batteryVoltageMv, "batteryVoltageMv");
  }

  const supported = new Set(profile.supportedIoIds);
  if (supported.size !== profile.supportedIoIds.length || !profile.supportedIoIds.every(isIoId)) {
    throw new Error("device profile supportedIoIds must contain unique integer IO IDs from 0 to 65535");
  }

  for (const mapping of profile.ioMappings) {
    validateMapping(mapping, supported);
  }
  for (const [eventType, ioId] of Object.entries(profile.eventIoIds)) {
    if (!validSources.has(eventType as DrivingEventType) || !supported.has(ioId)) {
      throw new Error("device profile eventIoIds must reference supported event sources and IO IDs");
    }
  }

  return profile;
}

function validateMapping(mapping: DeviceIoMappingRule, supported: Set<number>): void {
  if (!supported.has(mapping.ioId)) {
    throw new Error(`device profile mapping IO ID ${mapping.ioId} is not supported`);
  }
  if (!validSources.has(mapping.source)) {
    throw new Error(`device profile mapping source ${mapping.source} is not supported`);
  }
  if (mapping.bytes !== undefined && ![1, 2, 4].includes(mapping.bytes)) {
    throw new Error("device profile mapping bytes must be 1, 2, or 4");
  }
}

function assertVoltage(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`device profile default ${name} must be a non-negative integer millivolt value`);
  }
}

function isIoId(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= 65_535;
}
