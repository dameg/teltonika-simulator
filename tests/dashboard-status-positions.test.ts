import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import {
  PostgresDashboardStore,
  type DashboardPositionRecord,
  type DashboardStore,
} from "../src/dashboard/persistence/dashboard-store";
import type { DatabaseService } from "../src/dashboard/persistence/database.service";
import { StatusController } from "../src/dashboard/status/status.controller";
import { StatusService } from "../src/dashboard/status/status.service";

describe("status position pages", () => {
  it("keeps the no-query endpoint compatible while returning the latest bootstrap page", async () => {
    const positions = [position("41"), position("42")];
    const store = positionStore({ positions, hasMore: false });
    const service = new StatusService(store);

    await expect(service.listPositions()).resolves.toEqual({
      positions,
      configRevisions: [],
      nextRecordId: "42",
      hasMore: false,
    });
    expect(store.listPositions).toHaveBeenCalledWith({ imei: undefined, limit: 5_000 });
    expect(store.listConfigRevisionsForPositions).toHaveBeenCalledWith(positions);
  });

  it("uses a stable cursor and the delta default limit", async () => {
    const store = positionStore({ positions: [], hasMore: false });
    const service = new StatusService(store);

    await expect(service.listPositions(undefined, { afterRecordId: "42" })).resolves.toMatchObject({
      positions: [],
      nextRecordId: "42",
      hasMore: false,
    });
    expect(store.listPositions).toHaveBeenCalledWith({
      imei: undefined,
      afterRecordId: "42",
      limit: 1_000,
    });
  });

  it.each([
    [{ afterRecordId: "-1" }, "INVALID_RECORD_ID"],
    [{ afterRecordId: "not-an-id" }, "INVALID_RECORD_ID"],
    [{ limit: "5001" }, "INVALID_LIMIT"],
    [{ afterRecordId: "1", limit: "1001" }, "INVALID_LIMIT"],
    [{ afterRecordId: "1", limit: "0" }, "INVALID_LIMIT"],
  ] as const)("rejects invalid query %o", async (query, code) => {
    const service = new StatusService(positionStore({ positions: [], hasMore: false }));

    const error = await service.listPositions(undefined, query).catch((caught) => caught);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({ error: { code } });
  });

  it("forwards public query parameters from the controller", async () => {
    const store = positionStore({ positions: [], hasMore: false });
    const service = new StatusService(store);
    const controller = new StatusController(service);

    await controller.listPositions("15", "25");

    expect(store.listPositions).toHaveBeenCalledWith({
      imei: undefined,
      afterRecordId: "15",
      limit: 25,
    });
  });
});

describe("PostgresDashboardStore position pagination", () => {
  it("reads deltas in record-ID order, detects another page, and removes the lookahead row", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [databasePosition("11"), databasePosition("12"), databasePosition("13")],
    });
    const store = new PostgresDashboardStore({ query } as unknown as DatabaseService);

    const page = await store.listPositions({ afterRecordId: "10", limit: 2 });

    expect(page.positions.map(({ id }) => id)).toEqual(["11", "12"]);
    expect(page.hasMore).toBe(true);
    expect(query).toHaveBeenCalledOnce();
    const [sql, values] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("r.id > $1::bigint");
    expect(sql).toContain("ORDER BY r.id ASC");
    expect(values).toEqual(["10", 3]);
  });

  it("loads a bounded recent bootstrap page and exposes record IDs", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [databasePosition("91"), databasePosition("92")] });
    const store = new PostgresDashboardStore({ query } as unknown as DatabaseService);

    const page = await store.listPositions({ limit: 5_000 });

    expect(page.positions.map(({ id }) => id)).toEqual(["91", "92"]);
    expect(page.hasMore).toBe(false);
    const [sql, values] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("ORDER BY r.id DESC LIMIT $1");
    expect(sql).toContain("ORDER BY record_id ASC");
    expect(values).toEqual([5_000]);
  });

  it("continues from the returned cursor without gaps or duplicates", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({
        rows: [databasePosition("11"), databasePosition("12"), databasePosition("13")],
      })
      .mockResolvedValueOnce({
        rows: [databasePosition("13"), databasePosition("14")],
      });
    const store = new PostgresDashboardStore({ query } as unknown as DatabaseService);

    const first = await store.listPositions({ afterRecordId: "10", limit: 2 });
    const second = await store.listPositions({ afterRecordId: first.positions.at(-1)!.id, limit: 2 });
    const ids = [...first.positions, ...second.positions].map(({ id }) => id);

    expect(ids).toEqual(["11", "12", "13", "14"]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(query.mock.calls[1]?.[1]).toEqual(["12", 3]);
  });
});

function position(id: string): DashboardPositionRecord {
  return {
    id,
    imei: "356307042441013",
    tripId: "trip-1",
    configRevision: 1,
    timestampMs: Number(id),
    latitude: 52.2,
    longitude: 21,
    altitudeMeters: 100,
    headingDegrees: 90,
    speedKph: 50,
    satellites: 10,
  };
}

function databasePosition(id: string) {
  return {
    id,
    imei: "356307042441013",
    trip_id: "trip-1",
    config_revision: 1,
    recorded_at: new Date(Number(id)),
    latitude_e7: 522_000_000,
    longitude_e7: 210_000_000,
    altitude_m: 100,
    heading_deg: 90,
    speed_kph: 50,
    satellites: 10,
  };
}

function positionStore(page: { positions: DashboardPositionRecord[]; hasMore: boolean }) {
  return {
    listPositions: vi.fn().mockResolvedValue(page),
    listConfigRevisionsForPositions: vi.fn().mockResolvedValue([]),
  } as unknown as DashboardStore & {
    listPositions: ReturnType<typeof vi.fn>;
    listConfigRevisionsForPositions: ReturnType<typeof vi.fn>;
  };
}
