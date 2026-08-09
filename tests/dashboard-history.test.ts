import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import {
  decodeHistoryCursor,
  encodeHistoryCursor,
  HistoryService,
  mapStoredTelemetry,
  parseHistoryQuery,
} from "../src/dashboard/history";
import type { HistoryRepository } from "../src/dashboard/history";
import {
  determineTripTransition,
  tripInactivityMs,
} from "../src/dashboard/persistence/trip-policy";

describe("dashboard telemetry history mapping", () => {
  it("reconstructs typed AVL groups and derives the dashboard telemetry snapshot", () => {
    const result = mapStoredTelemetry(
      {
        timestamp: new Date("2026-08-09T12:00:00.000Z"),
        priority: 1,
        longitudeE7: 195_000_000,
        latitudeE7: 501_000_000,
        altitudeMeters: 220,
        headingDegrees: 92,
        satellites: 11,
        speedKph: 64,
        eventIoId: 239,
      },
      [
        { ioId: 239, ioSizeBytes: 1, numericValue: "1", byteaValue: null },
        { ioId: 66, ioSizeBytes: 2, numericValue: "13800", byteaValue: null },
        { ioId: 192, ioSizeBytes: 4, numericValue: "500123456", byteaValue: null },
        { ioId: 78, ioSizeBytes: 8, numericValue: "18446744073709551615", byteaValue: null },
        { ioId: 256, ioSizeBytes: 3, numericValue: null, byteaValue: Buffer.from("VIN") },
      ],
    );

    expect(result.record.io.eightBytes).toEqual([
      { id: 78, value: 18_446_744_073_709_551_615n },
    ]);
    expect(result.record.io.xBytes[0]).toEqual({
      id: 256,
      value: Uint8Array.from(Buffer.from("VIN")),
    });
    expect(result.telemetry.groups).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: "status",
        fields: expect.arrayContaining([
          expect.objectContaining({ key: "ignition", value: true, ioId: 239 }),
        ]),
      }),
      expect.objectContaining({
        key: "power",
        fields: expect.arrayContaining([
          expect.objectContaining({ key: "externalVoltage", value: 13.8, ioId: 66 }),
        ]),
      }),
      expect.objectContaining({
        key: "fuelDistance",
        fields: expect.arrayContaining([
          expect.objectContaining({ key: "totalOdometer", value: 500123.456, ioId: 192 }),
        ]),
      }),
    ]));
  });

  it("rejects corrupt persisted IO values instead of returning ambiguous telemetry", () => {
    expect(() => mapStoredTelemetry(
      {
        timestamp: "2026-08-09T12:00:00.000Z",
        priority: 0,
        longitudeE7: 0,
        latitudeE7: 0,
        altitudeMeters: 0,
        headingDegrees: 0,
        satellites: 0,
        speedKph: 0,
        eventIoId: 0,
      },
      [{ ioId: 66, ioSizeBytes: 2, numericValue: null, byteaValue: null }],
    )).toThrow("Stored IO element 66 has no value");
  });
});

describe("dashboard history query parameters", () => {
  it("applies a bounded default and round-trips opaque cursors", () => {
    const encoded = encodeHistoryCursor({
      kind: "trip",
      timestampMs: Date.parse("2026-08-09T12:00:00.000Z"),
      id: "d56e43c7-8d52-4b1c-a36e-2982b4a2a1fd",
    });

    expect(decodeHistoryCursor(encoded)).toEqual({
      kind: "trip",
      timestampMs: Date.parse("2026-08-09T12:00:00.000Z"),
      id: "d56e43c7-8d52-4b1c-a36e-2982b4a2a1fd",
    });
    expect(parseHistoryQuery({ cursor: encoded }, "trip")).toMatchObject({ limit: 100 });
    expect(() => parseHistoryQuery({ cursor: encoded }, "record")).toThrow(BadRequestException);
  });

  it.each([
    [{ limit: "0" }, "between 1 and 500"],
    [{ limit: "501" }, "between 1 and 500"],
    [{ limit: "2records" }, "positive integer"],
    [{ from: "not-a-date" }, "ISO-8601"],
    [{ from: "2026-08-10T00:00:00Z", to: "2026-08-09T00:00:00Z" }, "must not be later"],
    [{ cursor: "not-a-cursor" }, "cursor"],
  ])("rejects an invalid query %#", (query, message) => {
    try {
      parseHistoryQuery(query);
      throw new Error("Expected history query parsing to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const response = (error as BadRequestException).getResponse() as {
        error: { message: string };
      };
      expect(response.error.message).toContain(message);
    }
  });

  it("normalizes API identifiers before dispatching a parsed query", async () => {
    const repository = {
      listDeviceRecords: vi.fn().mockResolvedValue({ items: [] }),
      listDeviceTrips: vi.fn().mockResolvedValue({ items: [] }),
      listTripRecords: vi.fn().mockResolvedValue({ items: [] }),
    } as unknown as HistoryRepository;
    const service = new HistoryService(repository);

    await service.listDeviceRecords(" 123456789012345 ", {
      from: "2026-08-09T00:00:00.000Z",
      limit: "25",
    });

    expect(repository.listDeviceRecords).toHaveBeenCalledWith(
      "123456789012345",
      expect.objectContaining({ limit: 25, from: new Date("2026-08-09T00:00:00.000Z") }),
    );
  });

  it("rejects malformed trip IDs before a database query", () => {
    const repository = {
      listTripRecords: vi.fn(),
    } as unknown as HistoryRepository;
    const service = new HistoryService(repository);

    expect(() => service.listTripRecords("not-a-uuid", {})).toThrow(BadRequestException);
    expect(repository.listTripRecords).not.toHaveBeenCalled();
  });

  it("rejects malformed frame IDs before a database query", async () => {
    const repository = {
      getFrame: vi.fn(),
    } as unknown as HistoryRepository;
    const service = new HistoryService(repository);

    await expect(service.getFrame("1 OR 1=1")).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.getFrame).not.toHaveBeenCalled();
  });

  it("delegates bounded route sampling to the repository", async () => {
    const listTripRoute = vi.fn().mockResolvedValue([{ id: "1" }]);
    const repository = { listTripRoute } as unknown as HistoryRepository;
    const service = new HistoryService(repository);
    const tripId = "d56e43c7-8d52-4b1c-a36e-2982b4a2a1fd";

    await expect(service.listTripRoute(tripId, 250)).resolves.toEqual({ items: [{ id: "1" }] });
    expect(listTripRoute).toHaveBeenCalledWith(tripId, 250);
    expect(() => service.listTripRoute(tripId, 5_001)).toThrow(BadRequestException);
  });
});

describe("persisted telemetry trip policy", () => {
  const timestampMs = Date.parse("2026-08-09T12:00:00.000Z");

  it("starts and closes trips from ignition IO state", () => {
    expect(determineTripTransition({
      currentLastTimestampMs: null,
      ignition: true,
      recordTimestampMs: timestampMs,
    })).toBe("start");
    expect(determineTripTransition({
      currentLastTimestampMs: timestampMs,
      ignition: false,
      recordTimestampMs: timestampMs + 1_000,
    })).toBe("continue-and-close");
    expect(determineTripTransition({
      currentLastTimestampMs: null,
      ignition: false,
      recordTimestampMs: timestampMs,
    })).toBe("none");
  });

  it("rolls over after 30 minutes of inactivity", () => {
    expect(determineTripTransition({
      currentLastTimestampMs: timestampMs,
      ignition: undefined,
      recordTimestampMs: timestampMs + tripInactivityMs,
    })).toBe("rollover");
    expect(determineTripTransition({
      currentLastTimestampMs: timestampMs,
      ignition: undefined,
      recordTimestampMs: timestampMs + tripInactivityMs + 1,
    })).toBe("rollover");
    expect(determineTripTransition({
      currentLastTimestampMs: timestampMs,
      ignition: false,
      recordTimestampMs: timestampMs + tripInactivityMs + 1,
    })).toBe("close");
  });
});
