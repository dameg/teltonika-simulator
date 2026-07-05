import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { defaultCodec8ExtendedDeviceProfile, mapVehicleStateToAvlRecord } from "../src";
import type { VehicleState } from "../src";

const baseState = {
  timestampMs: 1_700_000_000_000,
  position: {
    latitude: 54.6872,
    longitude: 25.2797,
    altitudeMeters: 120.4,
    headingDegrees: 89.6,
    satellites: 12,
    hasGpsFix: true
  },
  speedKph: 42.4,
  accelerationMps2: 0.6,
  brakingMps2: 0,
  isStopped: false,
  isIdling: true,
  ignitionOn: true,
  movement: true,
  externalVoltageMv: 13_800,
  batteryVoltageMv: 4_100,
  events: []
} satisfies VehicleState;

describe("vehicle-state to AVL mapping", () => {
  it("maps a vehicle-state snapshot to AVL GPS and IO fields", () => {
    const record = mapVehicleStateToAvlRecord(baseState, defaultCodec8ExtendedDeviceProfile);

    expect(record).toMatchObject({
      timestampMs: 1_700_000_000_000,
      priority: 0,
      gps: {
        longitude: 252_797_000,
        latitude: 546_872_000,
        altitudeMeters: 120,
        headingDegrees: 90,
        satellites: 12,
        speedKph: 42
      },
      eventIoId: 0
    });
    expect(record.io.oneByte).toEqual(
      expect.arrayContaining([
        { id: 239, value: 1 },
        { id: 240, value: 1 },
        { id: 251, value: 1 },
        { id: 69, value: 1 }
      ])
    );
    expect(record.io.twoBytes).toEqual(
      expect.arrayContaining([
        { id: 66, value: 13_800 },
        { id: 67, value: 4_100 }
      ])
    );
  });

  it("maps no GPS fix to zero satellites and GPS validity IO", () => {
    const record = mapVehicleStateToAvlRecord(
      {
        ...baseState,
        position: { ...baseState.position, satellites: 9, hasGpsFix: false },
        events: [{ type: "gpsFixLost", timestampMs: baseState.timestampMs }]
      },
      defaultCodec8ExtendedDeviceProfile
    );

    expect(record.gps.satellites).toBe(0);
    expect(record.eventIoId).toBe(69);
    expect(record.io.oneByte).toEqual(expect.arrayContaining([{ id: 69, value: 0 }]));
  });

  it("maps default-profile event IO values for harsh driving", () => {
    const harshAcceleration = mapVehicleStateToAvlRecord(
      { ...baseState, events: [{ type: "harshAcceleration", timestampMs: baseState.timestampMs }] },
      defaultCodec8ExtendedDeviceProfile
    );
    const harshBraking = mapVehicleStateToAvlRecord(
      { ...baseState, events: [{ type: "harshBraking", timestampMs: baseState.timestampMs }] },
      defaultCodec8ExtendedDeviceProfile
    );

    expect(harshAcceleration.priority).toBe(1);
    expect(harshAcceleration.eventIoId).toBe(253);
    expect(harshAcceleration.io.oneByte).toEqual(expect.arrayContaining([{ id: 253, value: 1 }]));
    expect(harshBraking.eventIoId).toBe(253);
    expect(harshBraking.io.oneByte).toEqual(expect.arrayContaining([{ id: 253, value: 2 }]));
  });

  it("is deterministic for the same vehicle state and device profile", () => {
    expect(mapVehicleStateToAvlRecord(baseState, defaultCodec8ExtendedDeviceProfile)).toEqual(
      mapVehicleStateToAvlRecord(baseState, defaultCodec8ExtendedDeviceProfile)
    );
  });

  it("keeps mapping independent from TCP and binary encoding modules", () => {
    const source = readFileSync("src/avl-mapping.ts", "utf8");

    expect(source).not.toMatch(/^\s*import .*["'](?:node:net|net)["']/m);
    expect(source).not.toMatch(/^\s*import .*["'].*(?:codec|packet|encoder).*["']/im);
  });
});
