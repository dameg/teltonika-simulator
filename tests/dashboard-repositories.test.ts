import { describe, expect, it } from "vitest";

import {
  InMemoryDashboardDeviceRepository,
  InMemoryDashboardConfigRevisionRepository,
  InMemoryDashboardJourneyRepository,
  InMemoryDashboardLogRepository,
  InMemoryDashboardPositionRepository,
  InMemoryDashboardRuntimeRepository,
  type DashboardDeviceRecord,
  type DashboardLogEvent,
  type DashboardRunRecord,
} from "../src";

function createDeviceInput(imei: string) {
  return {
    imei,
    label: `Device ${imei.slice(-4)}`,
    config: {
      host: "127.0.0.1",
      port: 5027,
      intervalMs: 1000,
      reconnectDelayMs: 3000,
      routeFile: "tests/fixtures/city-loop.route.json",
      drivingStyle: "normal" as const,
      seed: 42,
      deviceProfile: "fmb920",
      packetCount: 2,
    },
  };
}

function createRunRecord(
  imei: string,
  status: DashboardRunRecord["status"]
): DashboardRunRecord {
  return {
    imei,
    status,
    updatedAtMs: 1,
    lastStartAtMs: status === "configured" ? undefined : 1,
    lastStopAtMs: status === "running" ? undefined : 2,
    lastError: status === "failed" ? "socket closed" : undefined,
  };
}

function createLogEvent(
  id: string,
  overrides: Partial<DashboardLogEvent> = {}
): DashboardLogEvent {
  return {
    id,
    imei: "123456789012345",
    severity: "info",
    type: "simulationStartRequested",
    message: "run requested",
    timestampMs: Number(id),
    ...overrides,
  };
}

describe("dashboard repositories", () => {
  it("stores devices with CRUD operations and duplicate rejection", () => {
    const repository = new InMemoryDashboardDeviceRepository();

    const created = repository.create(createDeviceInput("123456789012345"));
    expect(created.imei).toBe("123456789012345");
    expect(repository.get(" 123456789012345 ")?.label).toBe("Device 2345");

    const updated = repository.update("123456789012345", {
      label: "Updated",
      config: {
        intervalMs: 2000,
      },
    });
    expect(updated.label).toBe("Updated");
    expect(updated.config.intervalMs).toBe(2000);
    expect(repository.list()).toHaveLength(1);

    expect(() =>
      repository.create(createDeviceInput("123456789012345"))
    ).toThrow(/already exists/);

    expect(repository.delete("123456789012345")).toBe(true);
    expect(repository.get("123456789012345")).toBeUndefined();

    repository.create(createDeviceInput("123456789012346"));
    repository.clear();
    expect(repository.list()).toEqual([]);
  });

  it("tracks runtime records and aggregate counts", () => {
    const repository = new InMemoryDashboardRuntimeRepository();

    repository.set(createRunRecord("123456789012345", "configured"));
    repository.set(createRunRecord("123456789012346", "running"));
    repository.set(createRunRecord("123456789012347", "failed"));
    repository.update("123456789012345", {
      status: "starting",
      updatedAtMs: 3,
    });

    expect(repository.get("123456789012345")?.status).toBe("starting");
    expect(repository.listByStatus("running")).toHaveLength(1);
    expect(repository.getOverview()).toEqual({
      total: 3,
      counts: {
        configured: 0,
        starting: 1,
        running: 1,
        reconnecting: 0,
        stopped: 0,
        rejected: 0,
        failed: 1,
        interrupted: 0,
        completed: 0,
      },
    });
  });

  it("filters and clears logs", () => {
    const repository = new InMemoryDashboardLogRepository();

    repository.append(createLogEvent("1"));
    repository.append(
      createLogEvent("2", {
        imei: "123456789012346",
        severity: "error",
        type: "runFailed",
      })
    );
    repository.append(
      createLogEvent("3", {
        imei: "123456789012345",
        type: "avlPacketSent",
      })
    );

    expect(repository.list()).toHaveLength(3);
    expect(repository.list({ imei: "123456789012345" })).toHaveLength(2);
    expect(repository.list({ severity: "error" })).toHaveLength(1);
    expect(repository.list({ type: "avlPacketSent" })).toHaveLength(1);
    expect(repository.list({ limit: 1 }).map((event) => event.id)).toEqual([
      "3",
    ]);

    repository.clearByDevice("123456789012345");
    expect(repository.list()).toHaveLength(1);

    repository.clear();
    expect(repository.list()).toEqual([]);
  });

  it("keeps the complete position history per device", () => {
    const repository = new InMemoryDashboardPositionRepository();
    const point = {
      imei: "123456789012345",
      tripId: "trip-1",
      configRevision: 1,
      timestampMs: 1,
      latitude: 54.6872,
      longitude: 25.2797,
      altitudeMeters: 120,
      headingDegrees: 45,
      speedKph: 30,
      satellites: 12,
    };

    for (let index = 0; index < 1_005; index += 1) {
      repository.append({ ...point, timestampMs: index });
    }

    expect(repository.list(point.imei)).toHaveLength(1_005);
    expect(repository.list(point.imei)[0]?.timestampMs).toBe(0);
    repository.clearByDevice(point.imei);
    expect(repository.list()).toEqual([]);
  });

  it("stores immutable configuration revisions and filters them by referenced points", () => {
    const repository = new InMemoryDashboardConfigRevisionRepository();
    const config = createDeviceInput("123456789012345").config;

    repository.append({
      imei: "123456789012345",
      configRevision: 1,
      createdAtMs: 1,
      changedFields: [],
      config,
    });
    repository.append({
      imei: "123456789012345",
      configRevision: 2,
      createdAtMs: 2,
      changedFields: ["drivingStyle"],
      config: { ...config, drivingStyle: "aggressive" },
    });

    expect(repository.listReferenced([
      { imei: "123456789012345", configRevision: 2 },
    ])).toEqual([
      expect.objectContaining({ configRevision: 2, changedFields: ["drivingStyle"] }),
    ]);
  });

  it("stores resumable journey state independently per device", () => {
    const repository = new InMemoryDashboardJourneyRepository();
    repository.set({
      imei: "123456789012345",
      tripId: "trip-1",
      routeFile: "route.json",
      acceptedRecordCount: 4,
      completed: false,
      checkpoint: { nextTimestampMs: 5 },
    });

    expect(repository.get("123456789012345")).toMatchObject({
      tripId: "trip-1",
      acceptedRecordCount: 4,
      checkpoint: { nextTimestampMs: 5 },
    });
    repository.delete("123456789012345");
    expect(repository.get("123456789012345")).toBeUndefined();
  });

  it("keeps repository instances process-local", () => {
    const devicesA = new InMemoryDashboardDeviceRepository();
    const devicesB = new InMemoryDashboardDeviceRepository();
    const runsA = new InMemoryDashboardRuntimeRepository();
    const runsB = new InMemoryDashboardRuntimeRepository();
    const logsA = new InMemoryDashboardLogRepository();
    const logsB = new InMemoryDashboardLogRepository();
    const positionsA = new InMemoryDashboardPositionRepository();
    const positionsB = new InMemoryDashboardPositionRepository();

    devicesA.create(createDeviceInput("123456789012345"));
    runsA.set(createRunRecord("123456789012345", "running"));
    logsA.append(createLogEvent("1"));
    positionsA.append({ imei: "123456789012345", tripId: "trip-1", configRevision: 1, timestampMs: 1, latitude: 1, longitude: 1, altitudeMeters: 1, headingDegrees: 1, speedKph: 1, satellites: 1 });

    expect(devicesB.list()).toEqual([]);
    expect(runsB.list()).toEqual([]);
    expect(logsB.list()).toEqual([]);
    expect(positionsB.list()).toEqual([]);
  });
});
