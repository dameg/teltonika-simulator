import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  defaultCodec8ExtendedDeviceProfile,
  deviceProfiles,
  fmc003DeviceProfile,
  fmc150DeviceProfile,
  fmc250DeviceProfile,
  fmc650FmsDeviceProfile,
  getDeviceProfile,
  validateDeviceProfile
} from "../src";
import type { DeviceProfile } from "../src";

describe("device profiles", () => {
  it("provides the default Codec 8 Extended profile", () => {
    expect(getDeviceProfile("default-codec8e")).toBe(defaultCodec8ExtendedDeviceProfile);
    expect(defaultCodec8ExtendedDeviceProfile).toMatchObject({
      name: "default-codec8e",
      codec: "codec8e",
      modelName: "Default Codec 8 Extended"
    });
  });

  it("provides an FMC650 FMS profile with official IO IDs and element sizes", () => {
    expect(getDeviceProfile("fmc650-fms")).toBe(fmc650FmsDeviceProfile);
    expect(fmc650FmsDeviceProfile.ioMappings).toEqual(
      expect.arrayContaining([
        { ioId: 79, source: "brakeSwitch", bytes: 1 },
        { ioId: 80, source: "wheelBasedSpeed", bytes: 4 },
        { ioId: 84, source: "acceleratorPedalPosition", bytes: 4 },
        { ioId: 85, source: "engineLoad", bytes: 1 },
        { ioId: 86, source: "engineTotalFuelUsed", bytes: 4 },
        { ioId: 87, source: "fuelLevelPercent", bytes: 4 },
        { ioId: 88, source: "engineRpm", bytes: 4 }
      ])
    );
  });

  it.each([
    ["fmc003", "Teltonika FMC003", fmc003DeviceProfile],
    ["fmc150", "Teltonika FMC150", fmc150DeviceProfile],
    ["fmc250", "Teltonika FMC250", fmc250DeviceProfile]
  ] as const)("registers and exports the %s profile", (name, modelName, profile) => {
    expect(getDeviceProfile(name)).toBe(profile);
    expect(profile).toMatchObject({ name, modelName, codec: "codec8e" });
    expect(profile.eventIoIds).toMatchObject({
      harshAcceleration: 253,
      harshBraking: 253,
      idleStarted: 251,
      idleEnded: 251
    });
    expect(validateDeviceProfile(profile)).toBe(profile);
  });

  it("defines the official FMC003 IO IDs and element sizes", () => {
    expect(fmc003DeviceProfile.ioMappings).toEqual(
      expect.arrayContaining([
        { ioId: 12, source: "engineTotalFuelUsed", bytes: 4 },
        { ioId: 16, source: "totalOdometerMeters", bytes: 4 },
        { ioId: 31, source: "engineLoad", bytes: 1 },
        { ioId: 36, source: "engineRpm", bytes: 2 },
        { ioId: 37, source: "wheelBasedSpeed", bytes: 1 },
        { ioId: 41, source: "acceleratorPedalPosition", bytes: 1 },
        { ioId: 48, source: "fuelLevelPercent", bytes: 1 },
        { ioId: 199, source: "tripDistanceMeters", bytes: 4 }
      ])
    );
  });

  it.each([
    ["FMC150", fmc150DeviceProfile],
    ["FMC250", fmc250DeviceProfile]
  ] as const)("defines the official %s CAN IO IDs and element sizes", (_model, profile) => {
    const sources = new Set<string>(profile.ioMappings.map((mapping) => mapping.source));

    expect(profile.ioMappings).toEqual(
      expect.arrayContaining([
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
      ])
    );
    expect(sources.has("engineLoad")).toBe(false);
    expect(sources.has("tripDistanceMeters")).toBe(false);
  });

  it("keeps supported IO IDs complete and every mapping width explicit", () => {
    for (const profile of Object.values(deviceProfiles)) {
      const referencedIoIds = new Set([
        ...profile.ioMappings.map((mapping) => mapping.ioId),
        ...Object.values(profile.eventIoIds)
      ]);

      expect(new Set(profile.supportedIoIds)).toEqual(referencedIoIds);
      expect(profile.ioMappings.every((mapping) => mapping.bytes !== undefined)).toBe(true);
    }
  });

  it("maps vehicle state and events to explicit IO IDs", () => {
    expect(defaultCodec8ExtendedDeviceProfile.ioMappings).toEqual(
      expect.arrayContaining([
        { ioId: 239, source: "ignitionOn", bytes: 1 },
        { ioId: 240, source: "movement", bytes: 1 },
        { ioId: 66, source: "externalVoltageMv", bytes: 2 },
        { ioId: 67, source: "batteryVoltageMv", bytes: 2 },
        { ioId: 251, source: "isIdling", bytes: 1 },
        { ioId: 69, source: "hasGpsFix", bytes: 1 },
        { ioId: 253, source: "harshAcceleration", bytes: 1 },
        { ioId: 253, source: "harshBraking", bytes: 1 }
      ])
    );
    expect(defaultCodec8ExtendedDeviceProfile.eventIoIds).toMatchObject({
      harshAcceleration: 253,
      harshBraking: 253,
      idleStarted: 251,
      gpsFixLost: 69,
      gpsFixRestored: 69
    });
  });

  it("rejects malformed mappings", () => {
    const malformed = {
      ...defaultCodec8ExtendedDeviceProfile,
      ioMappings: [{ ioId: 999, source: "ignitionOn" }]
    } satisfies DeviceProfile;

    expect(validateDeviceProfile(defaultCodec8ExtendedDeviceProfile)).toBe(defaultCodec8ExtendedDeviceProfile);
    expect(() => validateDeviceProfile(malformed)).toThrow("device profile mapping IO ID 999 is not supported");
    expect(() => validateDeviceProfile({ ...defaultCodec8ExtendedDeviceProfile, supportedIoIds: [66, 66] })).toThrow("supportedIoIds");
    expect(() => getDeviceProfile("missing")).toThrow("Unknown device profile: missing");
    expect(() => getDeviceProfile("fcm250")).toThrow("Unknown device profile: fcm250");
  });

  it("keeps device profiles independent from route simulation and TCP modules", () => {
    const source = readFileSync("src/device-profile.ts", "utf8");

    expect(source).not.toMatch(/^\s*import .*["'](?:node:net|net)["']/m);
    expect(source).not.toMatch(/^\s*import .*["'].*(?:route|simulation|codec|packet|encoder).*["']/im);
  });
});
