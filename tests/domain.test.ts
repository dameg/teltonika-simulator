import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { toTeltonikaLatitude, toTeltonikaLongitude } from "../src";
import type { AvlRecord, DeviceProfile, DrivingStyleProfile, RouteDefinition, VehicleState } from "../src";

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

  it("represents AVL GPS, event IO, and grouped IO data", () => {
    const record = {
      timestampMs: 1_700_000_000_000,
      priority: 0,
      gps: {
        longitude: toTeltonikaLongitude(25.2797),
        latitude: toTeltonikaLatitude(54.6872),
        altitudeMeters: 120,
        headingDegrees: 90,
        satellites: 12,
        speedKph: 42
      },
      eventIoId: 239,
      io: {
        oneByte: [{ id: 239, value: 1 }],
        twoBytes: [{ id: 66, value: 13_800 }],
        fourBytes: [{ id: 199, value: 123_456 }],
        eightBytes: [{ id: 78, value: 12_345_678_901_234n }],
        xBytes: [{ id: 256, value: new Uint8Array([0x56, 0x49, 0x4e]) }]
      }
    } satisfies AvlRecord;

    expect(record.gps.longitude).toBe(252_797_000);
    expect(record.gps.latitude).toBe(546_872_000);
    expect(record.io.xBytes[0]?.value).toEqual(new Uint8Array([0x56, 0x49, 0x4e]));
  });

  it("converts known coordinates to signed Teltonika integer values", () => {
    expect(toTeltonikaLatitude(54.6872)).toBe(546_872_000);
    expect(toTeltonikaLongitude(25.2797)).toBe(252_797_000);
    expect(toTeltonikaLatitude(-33.865143)).toBe(-338_651_430);
    expect(toTeltonikaLongitude(-151.2099)).toBe(-1_512_099_000);
  });

  it("rejects invalid coordinate ranges clearly", () => {
    expect(() => toTeltonikaLatitude(90.000001)).toThrow("latitude must be between -90 and 90 degrees");
    expect(() => toTeltonikaLongitude(-180.000001)).toThrow("longitude must be between -180 and 180 degrees");
    expect(() => toTeltonikaLatitude(Number.NaN)).toThrow("latitude must be between -90 and 90 degrees");
  });
});
