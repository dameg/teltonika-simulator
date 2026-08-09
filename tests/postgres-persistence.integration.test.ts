import { build } from "esbuild";
import { join } from "node:path";

import {
  performImeiHandshake,
  runLiveSession,
  sendAvlPacket,
  startDashboardServer,
  type AvlRecord,
  type DashboardServer,
} from "../src";
import { DatabaseService } from "../src/dashboard/persistence/database.service";

const routeFile = join(__dirname, "fixtures", "city-loop.route.json");

describe("PostgreSQL dashboard persistence", () => {
  let server: DashboardServer;
  let database: DatabaseService;

  beforeAll(async () => {
    await build({
      entryPoints: ["src/dashboard/frontend/main.tsx"],
      bundle: true,
      platform: "browser",
      format: "iife",
      outfile: "dist/dashboard/frontend/dashboard-app.js",
      loader: { ".png": "dataurl" },
      logLevel: "silent",
    });
    await start();
  });

  beforeEach(async () => {
    await fetch(`${server.url}/api/runtime/stop-all`, { method: "POST" });
    await database.query(`TRUNCATE dashboard_logs, avl_io_elements, avl_records,
      avl_frame_receptions, avl_frames, runs, trips, device_config_revisions,
      simulator_configs, devices RESTART IDENTITY CASCADE`);
  });

  afterAll(async () => {
    await server.close();
  });

  it("keeps configured devices across application restarts and archives without purging history", async () => {
    const imei = "123456789012345";
    const create = await fetch(`${server.url}/api/devices`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imei, label: "Persistent truck", config: deviceConfig() }),
    });
    expect(create.status).toBe(201);

    await server.close();
    await start();

    await expect((await fetch(`${server.url}/api/devices`)).json()).resolves.toMatchObject({
      devices: [expect.objectContaining({ imei, label: "Persistent truck" })],
    });

    expect((await fetch(`${server.url}/api/devices/${imei}`, { method: "DELETE" })).status).toBe(204);
    await expect((await fetch(`${server.url}/api/devices`)).json()).resolves.toEqual({ devices: [] });
    const archived = await database.query<{ archived: boolean }>(
      "SELECT archived_at IS NOT NULL AS archived FROM devices WHERE imei = $1",
      [imei],
    );
    expect(archived.rows[0]?.archived).toBe(true);

    const recreate = await fetch(`${server.url}/api/devices`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imei, label: "Reactivated truck", config: deviceConfig() }),
    });
    expect(recreate.status).toBe(201);
    const revisions = await database.query<{ config_revision: number }>(
      "SELECT config_revision FROM simulator_configs WHERE imei = $1",
      [imei],
    );
    expect(revisions.rows[0]?.config_revision).toBe(2);
  });

  it("commits incoming frames before ACK and exposes canonical history without duplicate records", async () => {
    const imei = "999999999999999";
    await sendOneFrame(imei);
    await sendOneFrame(imei);

    const counts = await database.query<{
      frames: string; receptions: string; records: string; io: string;
    }>(`SELECT
      (SELECT count(*) FROM avl_frames)::text AS frames,
      (SELECT count(*) FROM avl_frame_receptions)::text AS receptions,
      (SELECT count(*) FROM avl_records)::text AS records,
      (SELECT count(*) FROM avl_io_elements)::text AS io`);
    expect(counts.rows[0]).toMatchObject({ frames: "1", receptions: "2", records: "1" });
    expect(Number(counts.rows[0]?.io)).toBeGreaterThan(0);

    const frames = await (await fetch(`${server.url}/api/frames?imei=${imei}`)).json();
    expect(frames.items).toEqual([
      expect.objectContaining({ decodeStatus: "decoded", receptionCount: 2, recordCount: 1 }),
    ]);
    const frameDetail = await (await fetch(`${server.url}/api/frames/${frames.items[0].id}`)).json();
    expect(frameDetail.frame).toMatchObject({
      payloadHex: expect.stringMatching(/^[0-9a-f]+$/),
      receptions: [
        expect.objectContaining({ acknowledgedRecordCount: 1 }),
        expect.objectContaining({ acknowledgedRecordCount: 1 }),
      ],
    });

    const trips = await (await fetch(`${server.url}/api/trips?imei=${imei}`)).json();
    expect(trips.items).toHaveLength(1);
    const route = await (await fetch(`${server.url}/api/trips/${trips.items[0].id}/route`)).json();
    expect(route.items[0]).toMatchObject({
      latitude: 54.6872,
      longitude: 25.2797,
      telemetry: { groups: expect.any(Array) },
    });
  });

  it("marks stale active runs as interrupted on startup", async () => {
    const imei = "777777777777777";
    await database.query("INSERT INTO devices (imei, label, source) VALUES ($1, $2, 'physical')", [imei, imei]);
    await database.query(
      `INSERT INTO runs (run_id, imei, status, updated_at, started_at)
       VALUES ('9c477f36-83fe-4cb7-981f-543333c8a64f', $1, 'running', now(), now())`,
      [imei],
    );

    await server.close();
    await start();
    const result = await database.query<{ status: string }>("SELECT status FROM runs WHERE imei = $1", [imei]);
    expect(result.rows[0]?.status).toBe("interrupted");
  });

  it("stores multi-record frames with unsigned 64-bit and arbitrary-byte IO values", async () => {
    const imei = "666666666666666";
    const handshake = await performImeiHandshake({
      host: server.parser.tcpAddress.address,
      port: server.parser.tcpAddress.port,
      imei,
    });
    expect(handshake.kind).toBe("accepted");
    if (handshake.kind !== "accepted") return;

    try {
      const sent = await sendAvlPacket(handshake.socket, [
        integrationRecord(1, true),
        integrationRecord(2, false),
      ]);
      expect(sent.acceptedRecordCount).toBe(2);
    } finally {
      handshake.socket.destroy();
    }

    const counts = await database.query<{ frames: string; records: string }>(
      `SELECT (SELECT count(*) FROM avl_frames)::text AS frames,
              (SELECT count(*) FROM avl_records)::text AS records`,
    );
    expect(counts.rows[0]).toEqual({ frames: "1", records: "2" });
    const io = await database.query<{
      bytes_hex: string | null;
      io_id: number;
      numeric_value: string | null;
    }>(
      `SELECT io_id, numeric_value::text, encode(bytea_value, 'hex') AS bytes_hex
       FROM avl_io_elements WHERE io_id IN (78, 256) ORDER BY io_id`,
    );
    expect(io.rows).toEqual([
      { io_id: 78, numeric_value: "18446744073709551615", bytes_hex: null },
      { io_id: 256, numeric_value: null, bytes_hex: "56494e" },
    ]);
  });

  it("serializes concurrent starts, protects active state, and resumes the durable checkpoint", async () => {
    const imei = "555555555555555";
    const create = await fetch(`${server.url}/api/devices`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        imei,
        label: "Checkpoint truck",
        config: deviceConfig({
          host: server.parser.tcpAddress.address,
          port: server.parser.tcpAddress.port,
          intervalMs: 20,
          reconnectDelayMs: 20,
          packetCount: 100,
        }),
      }),
    });
    expect(create.status).toBe(201);

    const starts = await Promise.all([
      fetch(`${server.url}/api/runtime/devices/${imei}/start`, { method: "POST" }),
      fetch(`${server.url}/api/runtime/devices/${imei}/start`, { method: "POST" }),
    ]);
    expect(starts.map((response) => response.status).sort()).toEqual([200, 409]);

    await waitFor(async () => Number((await database.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM avl_records WHERE imei = $1",
      [imei],
    )).rows[0]?.count) >= 2);

    expect((await fetch(`${server.url}/api/status/state`, { method: "DELETE" })).status).toBe(409);
    expect((await fetch(`${server.url}/api/runtime/devices/${imei}/stop`, { method: "POST" })).status).toBe(200);

    const beforeResume = await database.query<{
      accepted_record_count: string;
      checkpoint: unknown;
      id: string;
      status: string;
    }>(
      `SELECT id::text, accepted_record_count::text, checkpoint, status
       FROM trips WHERE imei = $1 ORDER BY started_at DESC LIMIT 1`,
      [imei],
    );
    expect(beforeResume.rows[0]).toMatchObject({ status: "active", checkpoint: expect.any(Object) });

    expect((await fetch(`${server.url}/api/runtime/devices/${imei}/start`, { method: "POST" })).status).toBe(200);
    await waitFor(async () => Number((await database.query<{ accepted_record_count: string }>(
      "SELECT accepted_record_count::text FROM trips WHERE id = $1::uuid",
      [beforeResume.rows[0]!.id],
    )).rows[0]?.accepted_record_count) > Number(beforeResume.rows[0]!.accepted_record_count));
    expect((await fetch(`${server.url}/api/runtime/devices/${imei}/stop`, { method: "POST" })).status).toBe(200);

    const tripCount = await database.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM trips WHERE imei = $1",
      [imei],
    );
    expect(tripCount.rows[0]?.count).toBe("1");
  });

  it("completes a trip at the natural packet limit and creates a new trip on restart", async () => {
    const imei = "444444444444444";
    const create = await fetch(`${server.url}/api/devices`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        imei,
        label: "Finite route truck",
        config: deviceConfig({
          host: server.parser.tcpAddress.address,
          port: server.parser.tcpAddress.port,
          intervalMs: 10,
          reconnectDelayMs: 10,
          packetCount: 1,
        }),
      }),
    });
    expect(create.status).toBe(201);

    expect((await fetch(`${server.url}/api/runtime/devices/${imei}/start`, { method: "POST" })).status).toBe(200);
    await waitFor(async () => (await latestRunStatus(database, imei)) === "completed");
    expect((await database.query<{ status: string }>(
      "SELECT status FROM trips WHERE imei = $1 ORDER BY started_at DESC LIMIT 1",
      [imei],
    )).rows[0]?.status).toBe("completed");

    expect((await fetch(`${server.url}/api/runtime/devices/${imei}/start`, { method: "POST" })).status).toBe(200);
    await waitFor(async () => Number((await database.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM trips WHERE imei = $1",
      [imei],
    )).rows[0]?.count) === 2);
    await waitFor(async () => (await latestRunStatus(database, imei)) === "completed");
  });

  async function start(): Promise<void> {
    server = await startDashboardServer({
      host: "127.0.0.1",
      port: 0,
      tcpHost: "127.0.0.1",
      tcpPort: 0,
      parserHealthHost: "127.0.0.1",
      parserHealthPort: 0,
    });
    database = server.app.get(DatabaseService);
  }

  async function sendOneFrame(imei: string): Promise<void> {
    await runLiveSession({
      host: server.parser.tcpAddress.address,
      port: server.parser.tcpAddress.port,
      imei,
      intervalMs: 10,
      reconnectDelayMs: 10,
      routeFile,
      drivingStyle: "normal",
      seed: 7,
      deviceProfile: "default-codec8e",
      packetCount: 1,
    });
  }
});

function deviceConfig(overrides: Partial<ReturnType<typeof baseDeviceConfig>> = {}) {
  return { ...baseDeviceConfig(), ...overrides };
}

function baseDeviceConfig() {
  return {
    host: "127.0.0.1",
    port: 5027,
    intervalMs: 1000,
    simulationSpeed: 0,
    reconnectDelayMs: 3000,
    routeFile,
    drivingStyle: "normal",
    seed: 42,
    deviceProfile: "default-codec8e",
    packetCount: 2,
  };
}

function integrationRecord(offset: number, ignition: boolean): AvlRecord {
  return {
    timestampMs: Date.parse("2026-08-09T12:00:00.000Z") + offset * 1_000,
    priority: 1,
    gps: {
      longitude: 252_797_000 + offset,
      latitude: 546_872_000 + offset,
      altitudeMeters: 120,
      headingDegrees: 90,
      satellites: 12,
      speedKph: ignition ? 50 : 0,
    },
    eventIoId: 239,
    io: {
      oneByte: [{ id: 239, value: ignition ? 1 : 0 }],
      twoBytes: [],
      fourBytes: [],
      eightBytes: offset === 1 ? [{ id: 78, value: 18_446_744_073_709_551_615n }] : [],
      xBytes: offset === 1 ? [{ id: 256, value: Uint8Array.from(Buffer.from("VIN")) }] : [],
    },
  };
}

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 3_000): Promise<void> {
  const startedAt = Date.now();
  while (!(await predicate())) {
    if (Date.now() - startedAt >= timeoutMs) throw new Error("Timed out waiting for database state.");
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
}

async function latestRunStatus(database: DatabaseService, imei: string): Promise<string | undefined> {
  return (await database.query<{ status: string }>(
    "SELECT status FROM runs WHERE imei = $1 ORDER BY updated_at DESC, run_id DESC LIMIT 1",
    [imei],
  )).rows[0]?.status;
}
