import { describe, expect, it } from "vitest";

import {
  colorForRevision,
  groupTracks,
  historyRecordsToTrackPositions,
  sampleTrackPositions,
  sampleTrackSegmentsWithinBudget,
  trackGeometryPointBudget,
  visibleTrackImeis,
  type TrackPosition,
  type TrackSegment,
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

  it("selects adaptive global geometry budgets from the map zoom", () => {
    expect(trackGeometryPointBudget("live", 10)).toBe(600);
    expect(trackGeometryPointBudget("live", 11)).toBe(1_500);
    expect(trackGeometryPointBudget("live", 13)).toBe(1_500);
    expect(trackGeometryPointBudget("live", 14)).toBe(3_000);
    expect(trackGeometryPointBudget("history", 10)).toBe(400);
    expect(trackGeometryPointBudget("history", 11)).toBe(1_000);
    expect(trackGeometryPointBudget("history", 13)).toBe(1_000);
    expect(trackGeometryPointBudget("history", 14)).toBe(2_000);
    expect(() => trackGeometryPointBudget("live", Number.NaN)).toThrow(RangeError);
  });

  it("samples all segments within one global budget and preserves every segment boundary", () => {
    const segments = [
      segment("111", "trip-a", 1, 0, 10),
      segment("111", "trip-a", 2, 10, 10),
      segment("222", "trip-b", 1, 20, 10),
    ];

    const sampled = sampleTrackSegmentsWithinBudget(segments, 10);

    expect(sampled.pointCount).toBe(10);
    expect(sampled.requestedBudget).toBe(10);
    expect(sampled.effectiveBudget).toBe(10);
    expect(sampled.segments.map((trackSegment) => [
      trackSegment.positions[0]?.latitude,
      trackSegment.positions.at(-1)?.latitude,
    ])).toEqual([[0, 9], [10, 19], [20, 29]]);
    expect(sampled.segments.flatMap((trackSegment) => trackSegment.positions).map(
      (position) => position.latitude,
    )).toEqual([...sampled.segments.flatMap((trackSegment) => trackSegment.positions).map(
      (position) => position.latitude,
    )].sort((left, right) => left - right));
  });

  it("keeps a selected history point in addition to segment and revision boundaries", () => {
    const selected = { ...point("111", "trip-a", 2, 15), id: "selected" };
    const first = segment("111", "trip-a", 1, 0, 10);
    const secondPositions = Array.from({ length: 10 }, (_, offset) => (
      offset === 5 ? selected : { ...point("111", "trip-a", 2, offset + 10), id: `p-${offset}` }
    ));
    const second: TrackSegment<typeof selected> = {
      key: "111\u0000trip-a\u00002",
      imei: "111",
      tripId: "trip-a",
      configRevision: 2,
      positions: secondPositions,
    };

    const sampled = sampleTrackSegmentsWithinBudget(
      [first, second],
      5,
      (position) => "id" in position && position.id === "selected",
    );

    expect(sampled.pointCount).toBe(5);
    expect(sampled.segments[0]?.positions.at(0)).toBe(first.positions.at(0));
    expect(sampled.segments[0]?.positions.at(-1)).toBe(first.positions.at(-1));
    expect(sampled.segments[1]?.positions.at(0)).toBe(second.positions.at(0));
    expect(sampled.segments[1]?.positions.at(-1)).toBe(second.positions.at(-1));
    expect(sampled.segments[1]?.positions).toContain(selected);
  });

  it("keeps the repeated position that joins adjacent revision segments", () => {
    const grouped = groupTracks([
      point("111", "trip-a", 1, 0),
      point("111", "trip-a", 1, 1),
      point("111", "trip-a", 1, 2),
      point("111", "trip-a", 2, 3),
      point("111", "trip-a", 2, 4),
      point("111", "trip-a", 2, 5),
    ], "");

    const sampled = sampleTrackSegmentsWithinBudget(grouped.segments, 4);

    expect(sampled.pointCount).toBe(4);
    expect(sampled.segments[0]?.positions.map((position) => position.latitude)).toEqual([0, 2]);
    expect(sampled.segments[1]?.positions.map((position) => position.latitude)).toEqual([2, 5]);
    expect(sampled.segments[0]?.positions.at(-1)).toBe(sampled.segments[1]?.positions[0]);
  });

  it("keeps samples of unchanged long segments stable when the last segment grows", () => {
    const unchangedFirst = segment("111", "trip-a", 1, 0, 100);
    const unchangedSecond = segment("222", "trip-b", 1, 1_000, 100);
    const growing = segment("333", "trip-c", 1, 2_000, 100);
    const before = sampleTrackSegmentsWithinBudget(
      [unchangedFirst, unchangedSecond, growing],
      30,
    );
    const appendedPosition = point("333", "trip-c", 1, 2_100);
    const after = sampleTrackSegmentsWithinBudget([
      unchangedFirst,
      unchangedSecond,
      { ...growing, positions: [...growing.positions, appendedPosition] },
    ], 30);

    expect(after.pointCount).toBe(before.pointCount);
    expect(after.segments[0]?.positions).toEqual(before.segments[0]?.positions);
    expect(after.segments[1]?.positions).toEqual(before.segments[1]?.positions);
    for (let index = 0; index < before.segments[0]!.positions.length; index += 1) {
      expect(after.segments[0]!.positions[index]).toBe(before.segments[0]!.positions[index]);
    }
    for (let index = 0; index < before.segments[1]!.positions.length; index += 1) {
      expect(after.segments[1]!.positions[index]).toBe(before.segments[1]!.positions[index]);
    }
    expect(after.segments[2]?.positions.at(-1)).toBe(appendedPosition);
  });

  it("raises the effective budget when required endpoints exceed the requested budget", () => {
    const segments = [
      segment("111", "trip-a", 1, 0, 2),
      segment("111", "trip-a", 2, 2, 2),
      segment("111", "trip-a", 3, 4, 2),
    ];

    const sampled = sampleTrackSegmentsWithinBudget(segments, 2);

    expect(sampled.pointCount).toBe(6);
    expect(sampled.requestedBudget).toBe(2);
    expect(sampled.effectiveBudget).toBe(6);
    expect(sampled.segments).toBe(segments);
  });

  it("reuses complete segment references and validates the global budget", () => {
    const complete = segment("111", "trip-a", 1, 0, 2);
    const segments = [complete];
    const sampled = sampleTrackSegmentsWithinBudget(segments, 10);

    expect(sampled.segments[0]).toBe(complete);
    expect(sampled.segments).toBe(segments);
    expect(() => sampleTrackSegmentsWithinBudget([complete], 0)).toThrow(RangeError);
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

function segment(
  imei: string,
  tripId: string,
  configRevision: number,
  startLatitude: number,
  length: number,
): TrackSegment {
  return {
    key: `${imei}\u0000${tripId}\u0000${configRevision}`,
    imei,
    tripId,
    configRevision,
    positions: Array.from({ length }, (_, offset) => (
      point(imei, tripId, configRevision, startLatitude + offset)
    )),
  };
}
