import { describe, expect, it, vi } from "vitest";

import { PostgresFrameStore } from "../src/dashboard/persistence/frame-store";
import type { DatabaseService } from "../src/dashboard/persistence/database.service";

describe("PostgresFrameStore", () => {
  it("persists one canonical decoded frame, typed IO elements, a trip, and its reception", async () => {
    const queries: Array<{ sql: string; values: readonly unknown[] }> = [];
    const client = {
      query: vi.fn(async (sql: string, values: readonly unknown[] = []) => {
        queries.push({ sql, values });
        if (sql.includes("INSERT INTO avl_frames")) return { rows: [{ id: "10" }] };
        if (sql.includes("INSERT INTO avl_frame_receptions")) return { rows: [{ id: "11" }] };
        if (sql.includes("FROM trips t")) return { rows: [] };
        if (sql.includes("INSERT INTO avl_records")) return { rows: [{ id: "20" }] };
        return { rows: [] };
      }),
    };
    const database = {
      withTransaction: async <T>(operation: (value: typeof client) => Promise<T>) => operation(client),
    } as unknown as DatabaseService;
    const store = new PostgresFrameStore(database);

    await store.persistFrame({
      sessionId: "tcp-session-1",
      imei: "123456789012345",
      receivedAt: new Date("2026-08-09T12:00:02.000Z"),
      rawFrame: Buffer.from("0001", "hex"),
      decoded: {
        codecId: 0x8e,
        dataLength: 20,
        recordCount: 1,
        crc: 1234,
        records: [{
          timestampMs: Date.parse("2026-08-09T12:00:00.000Z"),
          priority: 1,
          gps: {
            longitude: 195_000_000,
            latitude: 501_000_000,
            altitudeMeters: 220,
            headingDegrees: 90,
            satellites: 10,
            speedKph: 50,
          },
          eventIoId: 253,
          io: {
            oneByte: [
              { id: 239, value: 1 },
              { id: 253, value: 1 },
              { id: 253, value: 2 },
            ],
            twoBytes: [],
            fourBytes: [],
            eightBytes: [],
            xBytes: [],
          },
        }],
      },
    });

    const frameInsert = queries.find((query) => query.sql.includes("INSERT INTO avl_frames"));
    expect(frameInsert?.values.at(-1)).toEqual(new Date("2026-08-09T12:00:02.000Z"));

    const ioInsert = queries.find((query) => query.sql.includes("INSERT INTO avl_io_elements"));
    expect(ioInsert?.values).toEqual([
      "20", 0, 239, 1, "1", null,
      "20", 1, 253, 1, "1", null,
      "20", 2, 253, 1, "2", null,
    ]);

    const reception = queries.find((query) => query.sql.includes("INSERT INTO avl_frame_receptions"));
    expect(reception?.values).toEqual([
      "10",
      "123456789012345",
      "tcp-session-1",
      expect.stringMatching(/^[0-9a-f-]{36}$/),
      new Date("2026-08-09T12:00:02.000Z"),
    ]);
    const frameLog = queries.find((query) => query.sql.includes("INSERT INTO dashboard_logs"));
    expect(frameLog?.values).toEqual(expect.arrayContaining([
      "123456789012345",
      "info",
      "avlFrameReceived",
      new Date("2026-08-09T12:00:02.000Z"),
      "10",
    ]));
  });

  it("stores decode failures as canonical frames and auditable receptions", async () => {
    const queries: Array<{ sql: string; values: readonly unknown[] }> = [];
    const client = {
      query: vi.fn(async (sql: string, values: readonly unknown[] = []) => {
        queries.push({ sql, values });
        if (sql.includes("INSERT INTO avl_frames")) return { rows: [{ id: "30" }] };
        if (sql.includes("INSERT INTO avl_frame_receptions")) return { rows: [{ id: "31" }] };
        return { rows: [] };
      }),
    };
    const database = {
      withTransaction: async <T>(operation: (value: typeof client) => Promise<T>) => operation(client),
    } as unknown as DatabaseService;

    await new PostgresFrameStore(database).auditDecodeFailure({
      sessionId: "tcp-session-2",
      imei: "123456789012345",
      receivedAt: new Date("2026-08-09T12:00:00.000Z"),
      rawFrame: Buffer.from("ff", "hex"),
      error: { kind: "invalid_preamble", message: "bad preamble", field: "preamble" },
    });

    const frameInsert = queries.find((query) => query.sql.includes("INSERT INTO avl_frames"));
    expect(frameInsert?.sql).toContain("'failed'");
    expect(frameInsert?.values[2]).toBe(JSON.stringify({
      kind: "invalid_preamble",
      message: "bad preamble",
      field: "preamble",
    }));
    const reception = queries.find((query) => query.sql.includes("INSERT INTO avl_frame_receptions"));
    expect(reception?.values).toEqual([
      "30",
      "123456789012345",
      "tcp-session-2",
      null,
      new Date("2026-08-09T12:00:00.000Z"),
    ]);
    expect(queries.find((query) => query.sql.includes("INSERT INTO dashboard_logs"))?.values)
      .toEqual(expect.arrayContaining(["warn", "avlFrameDecodeFailed", "30"]));
  });
});
