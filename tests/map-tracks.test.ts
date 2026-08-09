import { describe, expect, it } from "vitest";

import {
  colorForRevision,
  groupTracks,
  historyRecordsToTrackPositions,
  sampleTrackPositions,
  visibleTrackImeis,
  type TrackPosition,
} from "../src/dashboard/frontend/map-tracks";

function point(
  imei: string,
  tripId: string,
  configRevision: number,
  latitude: number,
): TrackPosition {
  return { imei, tripId, configRevision, latitude, longitude: latitude + 0.1 };
}

describe("map tracks", () => {
  it("shows every device track until one device is selected", () => {
    const positions = [{ imei: "111" }, { imei: "222" }, { imei: "111" }];

    expect(visibleTrackImeis(positions, "")).toEqual(["111", "222"]);
    expect(visibleTrackImeis(positions, "222")).toEqual(["222"]);
  });

  it("groups tracks by device, trip, and configuration revision in one ordered result", () => {
    const positions = [
      point("111", "trip-a", 1, 1),
      point("111", "trip-a", 1, 2),
      point("111", "trip-a", 2, 3),
      point("111", "trip-b", 2, 10),
      point("111", "trip-b", 2, 11),
      point("222", "trip-c", 1, 20),
    ];

    const grouped = groupTracks(positions, "");

    expect(grouped.pointCount).toBe(6);
    expect(grouped.trips.map((trip) => `${trip.imei}:${trip.tripId}`)).toEqual([
      "111:trip-a",
      "111:trip-b",
      "222:trip-c",
    ]);
    expect(grouped.segments.map((segment) => [
      segment.imei,
      segment.tripId,
      segment.configRevision,
      segment.positions.map((position) => position.latitude),
    ])).toEqual([
      ["111", "trip-a", 1, [1, 2]],
      ["111", "trip-a", 2, [2, 3]],
      ["111", "trip-b", 2, [10, 11]],
      ["222", "trip-c", 1, [20]],
    ]);
  });

  it("repeats only the preceding point at a revision boundary and never joins trips", () => {
    const grouped = groupTracks([
      point("111", "trip-a", 1, 1),
      point("111", "trip-a", 2, 2),
      point("111", "trip-b", 2, 50),
    ], "");

    expect(grouped.segments[1]?.positions.map((position) => position.latitude)).toEqual([1, 2]);
    expect(grouped.segments[2]?.positions.map((position) => position.latitude)).toEqual([50]);
  });

  it("pre-groups only the selected device without changing stable revision colors", () => {
    const positions = [
      point("111", "trip-a", 1, 1),
      point("222", "trip-b", 1, 2),
      point("222", "trip-b", 2, 3),
    ];

    const grouped = groupTracks(positions, "222");

    expect(grouped.pointCount).toBe(2);
    expect(grouped.trips).toHaveLength(1);
    expect(grouped.trips[0]?.labelPosition.latitude).toBe(2);
    expect(colorForRevision("222", 2)).toBe(colorForRevision("222", 2));
    expect(colorForRevision("222", 1)).not.toBe(colorForRevision("222", 2));
  });

  it("assigns stable distinct colors beyond a fixed-size revision palette", () => {
    const colors = Array.from({ length: 32 }, (_, index) => colorForRevision("514610464651071", index + 1));

    expect(new Set(colors)).toHaveLength(32);
    expect(colorForRevision("514610464651071", 17)).toBe(colors[16]);
    expect(colorForRevision("514610464651072", 17)).not.toBe(colors[16]);
    expect(colors.every((color) => /^hsl\(\d+\.\d{6}, 68%, 42%\)$/.test(color))).toBe(true);
  });

  it("samples long tracks while preserving their endpoints", () => {
    const positions = Array.from({ length: 10_000 }, (_, latitude) =>
      point("111", "trip-a", 1, latitude),
    );

    const sampled = sampleTrackPositions(positions, 800);

    expect(sampled).toHaveLength(800);
    expect(sampled[0]).toBe(positions[0]);
    expect(sampled.at(-1)).toBe(positions.at(-1));
  });

  it("reuses short track arrays and validates the sample size", () => {
    const positions = [point("111", "trip-a", 1, 1), point("111", "trip-a", 1, 2)];

    expect(sampleTrackPositions(positions, 800)).toBe(positions);
    expect(() => sampleTrackPositions(positions, 1)).toThrow(RangeError);
  });

  it("maps stored history records onto one selectable trip without losing telemetry", () => {
    const telemetry = { groups: [{ key: "gps", label: "GPS", fields: [] }] };
    const records = [{
      id: "record-1",
      timestampMs: 1_700_000_000_000,
      latitude: 50.0614,
      longitude: 19.9383,
      altitudeMeters: 220,
      headingDegrees: 90,
      speedKph: 48,
      satellites: 12,
      telemetry,
    }];

    const positions = historyRecordsToTrackPositions(records, "123456789012345", "trip-1");

    expect(positions).toEqual([expect.objectContaining({
      id: "record-1",
      imei: "123456789012345",
      tripId: "trip-1",
      configRevision: 1,
      telemetry,
    })]);
  });
});
