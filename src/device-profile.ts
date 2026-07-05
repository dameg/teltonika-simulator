import type { CodecName, DeviceIoMappingRule, DeviceProfile, DrivingEventType, VehicleStateField } from "./domain";

const codec8Extended: CodecName = "codec8e";
const validSources = new Set<VehicleStateField | DrivingEventType>([
  "ignitionOn",
  "movement",
  "externalVoltageMv",
  "batteryVoltageMv",
  "isIdling",
  "satellites",
  "hasGpsFix",
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
  ioMappings: [
    { ioId: 239, source: "ignitionOn" },
    { ioId: 240, source: "movement" },
    { ioId: 66, source: "externalVoltageMv" },
    { ioId: 67, source: "batteryVoltageMv" },
    { ioId: 251, source: "isIdling" },
    { ioId: 69, source: "hasGpsFix" },
    { ioId: 253, source: "harshAcceleration" },
    { ioId: 253, source: "harshBraking" }
  ],
  eventIoIds: {
    harshAcceleration: 253,
    harshBraking: 253,
    idleStarted: 251,
    gpsFixLost: 69,
    gpsFixRestored: 69
  }
} satisfies DeviceProfile;

export const deviceProfiles = {
  [defaultCodec8ExtendedDeviceProfile.name]: defaultCodec8ExtendedDeviceProfile
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
}

function assertVoltage(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`device profile default ${name} must be a non-negative integer millivolt value`);
  }
}

function isIoId(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= 65_535;
}
