import { describe, expect, it, vi } from "vitest";

import type { DashboardDeviceRecord } from "../src/dashboard/domain";
import { PostgresDashboardStore, type DashboardStore } from "../src/dashboard/persistence/dashboard-store";
import type { DatabaseService } from "../src/dashboard/persistence/database.service";
import { RuntimeConfigRegistry } from "../src/dashboard/runtime/runtime-config-registry";
import { RuntimeService } from "../src/dashboard/runtime/runtime.service";

describe("persistent dashboard runtime coordination", () => {
  it("reserves an IMEI across awaits and removes the reservation when durable startup fails", async () => {
    let releaseJourney = () => {};
    const journeyGate = new Promise<void>((resolve) => {
      releaseJourney = resolve;
    });
    const device = testDevice();
    const getActiveJourney = vi.fn(async () => {
      await journeyGate;
      return {
        imei: device.imei,
        tripId: "4213ccaa-3d27-47bd-a4fd-52554fdd6615",
        routeFile: device.config.routeFile,
        acceptedRecordCount: 0,
        completed: false,
      };
    });
    const startRun = vi.fn(async () => {
      throw new Error("start transaction rolled back after log insert failed");
    });
    const store = {
      getDevice: vi.fn(async () => device),
      getActiveJourney,
      startRun,
    } as unknown as DashboardStore;
    const service = new RuntimeService(store, new RuntimeConfigRegistry());

    const firstStart = service.startDevice(device.imei);
    await vi.waitFor(() => expect(getActiveJourney).toHaveBeenCalledOnce());

    await expect(service.startDevice(device.imei)).rejects.toThrow("Run already active");
    releaseJourney();
    await expect(firstStart).rejects.toThrow("log insert failed");

    await expect(service.startDevice(device.imei)).rejects.toThrow("log insert failed");
    expect(startRun).toHaveBeenCalledTimes(2);
  });

  it("writes the starting run and its audit log in one database transaction", async () => {
    const client = {
      query: vi.fn(async (_sql: string, _values?: readonly unknown[]) => ({ rows: [], rowCount: 1 })),
    };
    const database = {
      withTransaction: vi.fn(async (operation: (value: typeof client) => Promise<unknown>) => operation(client)),
    } as unknown as DatabaseService;
    const store = new PostgresDashboardStore(database);

    await store.startRun(
      {
        imei: "123456789012345",
        runId: "4213ccaa-3d27-47bd-a4fd-52554fdd6615",
        status: "starting",
        updatedAtMs: 1_700_000_000_000,
        lastStartAtMs: 1_700_000_000_000,
      },
      {
        id: "6ef894ee-501f-47d9-ae69-3e9c2a83b779",
        imei: "123456789012345",
        severity: "info",
        type: "simulationStartRequested",
        message: "Simulation start requested.",
        timestampMs: 1_700_000_000_000,
      },
    );

    expect(database.withTransaction).toHaveBeenCalledOnce();
    expect(client.query).toHaveBeenCalledTimes(2);
    expect(client.query.mock.calls[0]?.[0]).toContain("INSERT INTO runs");
    expect(client.query.mock.calls[1]?.[0]).toContain("INSERT INTO dashboard_logs");
  });
});

function testDevice(): DashboardDeviceRecord {
  return {
    imei: "123456789012345",
    label: "Runtime test device",
    configRevision: 1,
    createdAtMs: 1,
    updatedAtMs: 1,
    config: {
      host: "127.0.0.1",
      port: 5027,
      intervalMs: 1_000,
      simulationSpeed: 0,
      reconnectDelayMs: 3_000,
      routeFile: "tests/fixtures/city-loop.route.json",
      drivingStyle: "normal",
      seed: 1,
      deviceProfile: "default-codec8e",
      packetCount: 1,
    },
  };
}
