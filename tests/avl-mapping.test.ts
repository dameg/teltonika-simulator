import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  decodeCodec8ExtendedPacket,
  defaultCodec8ExtendedDeviceProfile,
  encodeCodec8ExtendedPacket,
  fmc003DeviceProfile,
  fmc150DeviceProfile,
  fmc250DeviceProfile,
  fmc650FmsDeviceProfile,
  mapVehicleStateToAvlRecord
} from "../src";
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
  tripDistanceMeters: 1_234.5,
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

  it("maps no GPS fix to zero satellites and GNSS-without-fix status", () => {
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
    expect(record.io.oneByte).toEqual(expect.arrayContaining([{ id: 69, value: 2 }]));
  });

  it.each([
    ["FMC003", fmc003DeviceProfile],
    ["FMC150", fmc150DeviceProfile],
    ["FMC250", fmc250DeviceProfile]
  ] as const)("maps idle start and end events through AVL 251 for %s", (_model, profile) => {
    const started = mapVehicleStateToAvlRecord(
      { ...baseState, isIdling: true, events: [{ type: "idleStarted", timestampMs: baseState.timestampMs }] },
      profile
    );
    const ended = mapVehicleStateToAvlRecord(
      { ...baseState, isIdling: false, events: [{ type: "idleEnded", timestampMs: baseState.timestampMs }] },
      profile
    );

    expect(started.eventIoId).toBe(251);
    expect(started.io.oneByte).toEqual(expect.arrayContaining([{ id: 251, value: 1 }]));
    expect(ended.eventIoId).toBe(251);
    expect(ended.io.oneByte).toEqual(expect.arrayContaining([{ id: 251, value: 0 }]));
  });

  it.each([
    ["FMC003", fmc003DeviceProfile],
    ["FMC150", fmc150DeviceProfile],
    ["FMC250", fmc250DeviceProfile]
  ] as const)("maps harsh-driving events through AVL 253 for %s", (_model, profile) => {
    const acceleration = mapVehicleStateToAvlRecord(
      { ...baseState, events: [{ type: "harshAcceleration", timestampMs: baseState.timestampMs }] },
      profile
    );
    const braking = mapVehicleStateToAvlRecord(
      { ...baseState, events: [{ type: "harshBraking", timestampMs: baseState.timestampMs }] },
      profile
    );

    expect(acceleration.eventIoId).toBe(253);
    expect(acceleration.io.oneByte).toEqual(expect.arrayContaining([{ id: 253, value: 1 }]));
    expect(braking.eventIoId).toBe(253);
    expect(braking.io.oneByte).toEqual(expect.arrayContaining([{ id: 253, value: 2 }]));
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

  it("maps FMC650 FMS telemetry using vendor-defined AVL element sizes", () => {
    const record = mapVehicleStateToAvlRecord(baseState, fmc650FmsDeviceProfile);

    expect(record.io.oneByte).toEqual(
      expect.arrayContaining([
        { id: 79, value: 0 },
        { id: 81, value: 0 },
        { id: 82, value: 0 },
        { id: 83, value: 0 },
        { id: 85, value: 65 }
      ])
    );
    expect(record.io.twoBytes).toEqual(
      expect.arrayContaining([
        { id: 89, value: 5_200 },
        { id: 90, value: 7_800 },
        { id: 91, value: 7_600 }
      ])
    );
    expect(record.io.fourBytes).toEqual(
      expect.arrayContaining([
        { id: 80, value: 42 },
        { id: 84, value: 51 },
        { id: 86, value: 25_000 },
        { id: 87, value: 78 },
        { id: 88, value: 650 },
        { id: 192, value: 500_001_234 },
        { id: 193, value: 1_234 }
      ])
    );

    const decoded = decodeCodec8ExtendedPacket(encodeCodec8ExtendedPacket([record]));
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.packet.records[0]?.io).toEqual(record.io);
    }
  });

  it("maps FMC003 telemetry into parser-visible 1-, 2-, and 4-byte groups", () => {
    const record = mapVehicleStateToAvlRecord(baseState, fmc003DeviceProfile);

    expect(record.io.oneByte).toEqual(expect.arrayContaining([
      { id: 31, value: 65 },
      { id: 37, value: 42 },
      { id: 41, value: 51 },
      { id: 48, value: 78 }
    ]));
    expect(record.io.twoBytes).toEqual(expect.arrayContaining([{ id: 36, value: 650 }]));
    expect(record.io.fourBytes).toEqual(expect.arrayContaining([
      { id: 12, value: 25_000 },
      { id: 16, value: 500_001_234 },
      { id: 199, value: 1_234 }
    ]));

    const decoded = decodeCodec8ExtendedPacket(encodeCodec8ExtendedPacket([record]));
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.packet.records[0]?.io).toEqual(record.io);
    }
  });

  it.each([
    ["FMC150", fmc150DeviceProfile],
    ["FMC250", fmc250DeviceProfile]
  ] as const)("maps %s CAN telemetry and round-trips Codec 8E", (_model, profile) => {
    const record = mapVehicleStateToAvlRecord(baseState, profile);

    expect(record.io.oneByte).toEqual(expect.arrayContaining([
      { id: 81, value: 42 },
      { id: 82, value: 51 },
      { id: 89, value: 78 },
      { id: 910, value: 0 },
      { id: 911, value: 0 },
      { id: 937, value: 0 },
      { id: 946, value: 0 }
    ]));
    expect(record.io.twoBytes).toEqual(expect.arrayContaining([
      { id: 85, value: 650 },
      { id: 118, value: 5_200 },
      { id: 119, value: 7_800 },
      { id: 120, value: 7_600 }
    ]));
    expect(record.io.fourBytes).toEqual(expect.arrayContaining([
      { id: 83, value: 25_000 },
      { id: 87, value: 500_001_234 }
    ]));

    const decoded = decodeCodec8ExtendedPacket(encodeCodec8ExtendedPacket([record]));
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.packet.records[0]?.io).toEqual(record.io);
    }
  });

  it("keeps mapping independent from TCP and binary encoding modules", () => {
    const source = readFileSync("src/avl-mapping.ts", "utf8");

    expect(source).not.toMatch(/^\s*import .*["'](?:node:net|net)["']/m);
    expect(source).not.toMatch(/^\s*import .*["'].*(?:codec|packet|encoder).*["']/im);
  });
});
