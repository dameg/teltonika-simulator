import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  defaultCodec8ExtendedDeviceProfile,
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

  it("maps vehicle state and events to explicit IO IDs", () => {
    expect(defaultCodec8ExtendedDeviceProfile.ioMappings).toEqual(
      expect.arrayContaining([
        { ioId: 239, source: "ignitionOn" },
        { ioId: 240, source: "movement" },
        { ioId: 66, source: "externalVoltageMv" },
        { ioId: 67, source: "batteryVoltageMv" },
        { ioId: 251, source: "isIdling" },
        { ioId: 69, source: "hasGpsFix" },
        { ioId: 253, source: "harshAcceleration" },
        { ioId: 253, source: "harshBraking" }
      ])
    );
    expect(defaultCodec8ExtendedDeviceProfile.eventIoIds).toMatchObject({
      harshAcceleration: 253,
      harshBraking: 253,
      idleStarted: 251
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
  });

  it("keeps device profiles independent from route simulation and TCP modules", () => {
    const source = readFileSync("src/device-profile.ts", "utf8");

    expect(source).not.toMatch(/^\s*import .*["'](?:node:net|net)["']/m);
    expect(source).not.toMatch(/^\s*import .*["'].*(?:route|simulation|codec|packet|encoder).*["']/im);
  });
});
