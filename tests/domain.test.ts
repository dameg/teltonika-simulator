import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import type { DeviceProfile, DrivingStyleProfile, RouteDefinition, VehicleState } from "../src";

describe("domain models", () => {
  it("represents route metadata and ordered route points", () => {
    const route = {
      metadata: { id: "city-loop", name: "City loop" },
      points: [
        { latitude: 54.6872, longitude: 25.2797, altitudeMeters: 120, speedLimitKph: 50 },
        { latitude: 54.688, longitude: 25.281, stopDurationMs: 30000 }
      ]
    } satisfies RouteDefinition;

    expect(route.points.map((point) => point.latitude)).toEqual([54.6872, 54.688]);
  });

  it("represents MVP driving-style parameters", () => {
    const names = ["eco", "normal", "aggressive"] satisfies DrivingStyleProfile["name"][];
    const profile = {
      name: "aggressive",
      targetAccelerationMps2: 2.4,
      brakingIntensityMps2: 3.1,
      speedVariationRatio: 0.2,
      idleProbability: 0.03,
      corneringSlowdownRatio: 0.75,
      harshAccelerationProbability: 0.08,
      harshBrakingProbability: 0.07
    } satisfies DrivingStyleProfile;

    expect(names).toEqual(["eco", "normal", "aggressive"]);
    expect(profile.harshAccelerationProbability).toBeGreaterThan(0);
  });

  it("represents vehicle state and device-profile mapping rules", () => {
    const state = {
      timestampMs: 1_700_000_000_000,
      position: {
        latitude: 54.6872,
        longitude: 25.2797,
        altitudeMeters: 120,
        headingDegrees: 90,
        satellites: 12,
        hasGpsFix: true
      },
      speedKph: 42,
      accelerationMps2: 0.6,
      brakingMps2: 0,
      isStopped: false,
      isIdling: false,
      ignitionOn: true,
      movement: true,
      externalVoltageMv: 13_800,
      batteryVoltageMv: 4_100,
      events: [{ type: "harshAcceleration", timestampMs: 1_700_000_000_000 }]
    } satisfies VehicleState;

    const profile = {
      name: "default-codec8e",
      modelName: "Default Codec 8 Extended",
      codec: "codec8e",
      supportedIoIds: [239, 240, 66, 67],
      defaults: { priority: 0, externalVoltageMv: 12_500 },
      ioMappings: [
        { ioId: 239, source: "ignitionOn" },
        { ioId: 240, source: "movement" },
        { ioId: 66, source: "externalVoltageMv" },
        { ioId: 67, source: "batteryVoltageMv" },
        { ioId: 253, source: "harshAcceleration" }
      ],
      eventIoIds: { harshAcceleration: 253, harshBraking: 254 }
    } satisfies DeviceProfile;

    expect(state.events[0]?.type).toBe("harshAcceleration");
    expect(profile.ioMappings.map((mapping) => mapping.source)).toContain("ignitionOn");
  });

  it("keeps domain models independent from TCP and packet encoding modules", () => {
    const source = readFileSync("src/domain.ts", "utf8");

    expect(source).not.toMatch(/^\s*import .*["'](?:node:net|net)["']/m);
    expect(source).not.toMatch(/^\s*import .*["'].*(?:codec|packet|encoder).*["']/im);
  });
});
