import { describe, expect, it } from "vitest";

import { mergeConfigRevisions, mergeLivePositions } from "../src/dashboard/frontend/live-positions";
import type { MapPosition } from "../src/dashboard/frontend/DeviceMap";

function position(id: string, overrides: Partial<MapPosition> = {}): MapPosition {
  return {
    id,
    imei: "123456789012345",
    tripId: "trip-1",
    configRevision: 1,
    timestampMs: Number(id),
    latitude: 50,
    longitude: 20,
    altitudeMeters: 100,
    headingDegrees: 90,
    speedKph: 40,
    satellites: 10,
    ...overrides,
  };
}

describe("live position cache", () => {
  it("merges deltas by record id and keeps numeric id order", () => {
    expect(mergeLivePositions([position("9"), position("10")], [position("11"), position("10", { speedKph: 50 })]))
      .toEqual([position("9"), position("10", { speedKph: 50 }), position("11")]);
  });

  it("keeps only the newest bounded records", () => {
    expect(mergeLivePositions([position("1"), position("2")], [position("3"), position("4")], 3).map(({ id }) => id))
      .toEqual(["2", "3", "4"]);
  });

  it("reuses the current array for an empty delta", () => {
    const current = [position("1")];
    expect(mergeLivePositions(current, [])).toBe(current);
  });

  it("deduplicates configuration revisions", () => {
    const first = { imei: "123", configRevision: 1, createdAtMs: 1, changedFields: [], config: {} };
    const updated = { ...first, changedFields: ["intervalMs"] };
    expect(mergeConfigRevisions([first], [updated])).toEqual([updated]);
  });
});
