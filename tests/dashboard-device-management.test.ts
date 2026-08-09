import { describe, expect, it, vi } from "vitest";

import { DashboardDomainError } from "../src/dashboard/domain";
import { PostgresDashboardStore } from "../src/dashboard/persistence/dashboard-store";
import type { DatabaseService } from "../src/dashboard/persistence/database.service";

describe("PostgreSQL device management", () => {
  it("reactivates an archived IMEI with a new immutable configuration revision", async () => {
    const client = transactionClient([{ archived_at: new Date(), config_revision: 4 }]);
    const database = fakeDatabase(client, 5);
    const store = new PostgresDashboardStore(database as unknown as DatabaseService);

    const device = await store.createDevice({
      imei: "123456789012345",
      label: "Reactivated device",
      config: testConfig(),
    });

    expect(device.configRevision).toBe(5);
    const simulatorConfigCall = client.query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO simulator_configs"),
    );
    expect(simulatorConfigCall?.[1]?.[2]).toBe(5);
    const revisionCall = client.query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO device_config_revisions"),
    );
    expect(revisionCall?.[1]?.[1]).toBe(5);
  });

  it("rejects a duplicate active simulator without changing its configuration", async () => {
    const client = transactionClient([{ archived_at: null, config_revision: 2 }]);
    const database = fakeDatabase(client, 2);
    const store = new PostgresDashboardStore(database as unknown as DatabaseService);

    await expect(store.createDevice({
      imei: "123456789012345",
      label: "Duplicate",
      config: testConfig(),
    })).rejects.toMatchObject({ code: "DUPLICATE_IMEI" } satisfies Partial<DashboardDomainError>);

    expect(client.query.mock.calls.some(([sql]) =>
      String(sql).includes("INSERT INTO simulator_configs"),
    )).toBe(false);
  });
});

function transactionClient(existingRows: Array<{ archived_at: Date | null; config_revision: number | null }>) {
  return {
    query: vi.fn(async (sql: string, _values?: readonly unknown[]) => ({
      rows: sql.includes("SELECT d.archived_at") ? existingRows : [],
      rowCount: 1,
    })),
  };
}

function fakeDatabase(client: ReturnType<typeof transactionClient>, configRevision: number) {
  return {
    withTransaction: vi.fn(async (operation: (value: typeof client) => Promise<unknown>) => operation(client)),
    query: vi.fn(async () => ({
      rows: [{
        imei: "123456789012345",
        label: "Reactivated device",
        config: testConfig(),
        config_revision: configRevision,
        created_at: new Date(1),
        updated_at: new Date(2),
      }],
      rowCount: 1,
    })),
  };
}

function testConfig() {
  return {
    host: "127.0.0.1",
    port: 5027,
    intervalMs: 1_000,
    simulationSpeed: 0,
    reconnectDelayMs: 3_000,
    routeFile: "tests/fixtures/city-loop.route.json",
    drivingStyle: "normal" as const,
    seed: 1,
    deviceProfile: "default-codec8e",
    packetCount: 1,
  };
}
