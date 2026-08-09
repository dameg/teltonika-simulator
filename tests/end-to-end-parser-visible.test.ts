import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { createConnection, type Socket } from "node:net";
import { dirname, resolve } from "node:path";
import { join } from "node:path";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createDryRunOutput,
  encodeImeiHandshakeFrame,
  parseConfig,
  startDashboardBackend,
  startDashboardServer,
  type DashboardBackend,
  type DashboardServer
} from "../src";
import type {
  FrameDecodeFailureInput,
  FrameIngestInput,
  FrameIngestStore,
} from "../src/frame-ingest-store";
import { DatabaseService } from "../src/dashboard/persistence/database.service";

const frontendEntry = resolve(process.cwd(), "src/dashboard/frontend/main.tsx");
const frontendOutfile = resolve(process.cwd(), "dist/dashboard/frontend/dashboard-app.js");
const routeFile = join(__dirname, "fixtures", "city-loop.route.json");

describe("end-to-end parser-visible coverage", () => {
  const backends: DashboardBackend[] = [];
  const stores = new WeakMap<DashboardBackend, RecordingFrameIngestStore>();
  let dashboardServer: DashboardServer;
  let database: DatabaseService;

  beforeAll(async () => {
    await mkdir(dirname(frontendOutfile), { recursive: true });
    await build({
      entryPoints: [frontendEntry],
      outfile: frontendOutfile,
      bundle: true,
      format: "esm",
      platform: "browser",
      target: ["es2020"],
      jsx: "automatic",
      sourcemap: false,
      loader: { ".png": "dataurl" },
      logLevel: "silent"
    });

    dashboardServer = await startDashboardServer({
      host: "127.0.0.1",
      port: 0,
      tcpHost: "127.0.0.1",
      tcpPort: 0,
      parserHealthHost: "127.0.0.1",
      parserHealthPort: 0,
    });
    database = dashboardServer.app.get(DatabaseService);
  });

  beforeEach(async () => {
    await database.query(`TRUNCATE dashboard_logs, avl_io_elements, avl_records,
      avl_frame_receptions, avl_frames, runs, trips, device_config_revisions,
      simulator_configs, devices RESTART IDENTITY CASCADE`);
  });

  afterEach(async () => {
    await Promise.allSettled(backends.splice(0).map((backend) => backend.close()));
  });

  afterAll(async () => {
    await dashboardServer.close();
  });

  it("persists decoded AVL packets before the simulator observes an acknowledgement", async () => {
    const backend = await useBackend();
    const store = storeFor(backend);
    const imei = "123456789012345";

    const createResponse = await fetch(`${dashboardServer.url}/api/devices`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        imei,
        label: "Parser Coverage Device",
        config: {
          host: backend.tcpAddress.address,
          port: backend.tcpAddress.port,
          intervalMs: 25,
          reconnectDelayMs: 25,
          routeFile,
          drivingStyle: "normal",
          seed: 7,
          deviceProfile: "default-codec8e",
          packetCount: 2
        }
      })
    });
    expect(createResponse.status).toBe(201);

    const startResponse = await fetch(`${dashboardServer.url}/api/runtime/devices/${imei}/start`, {
      method: "POST"
    });
    expect(startResponse.status).toBe(200);

    await waitFor(() => store.frames.length > 0, 3_000);

    const logResponse = await fetch(`${dashboardServer.url}/api/logs?imei=${imei}&limit=100`);
    const logTypes = ((await logResponse.json()) as { events: Array<{ type: string }> })
      .events.map((event) => event.type);
    expect(logTypes).toContain("tcpConnected");
    expect(logTypes).toContain("imeiSent");
    expect(logTypes).toContain("imeiAccepted");

    const frame = store.frames[0];
    expect(frame?.imei).toBe(imei);
    expect(frame?.rawFrame.toString("hex")).toMatch(/^[0-9a-f]+$/);
    expect(frame?.decoded.codecId).toBe(0x8e);
    expect(frame?.decoded.recordCount).toBeGreaterThan(0);
    expect(frame?.decoded.records[0]?.gps.longitude).toBeTypeOf("number");
    expect(frame?.decoded.records[0]?.gps.latitude).toBeTypeOf("number");

    const stopResponse = await fetch(`${dashboardServer.url}/api/runtime/devices/${imei}/stop`, {
      method: "POST"
    });
    expect(stopResponse.status).toBe(200);
  });

  it("audits malformed packets without acknowledging them", async () => {
    const backend = await useBackend();
    const store = storeFor(backend);
    const socket = await connectSocket(backend.tcpAddress.address, backend.tcpAddress.port);

    try {
      const imei = "123456789012345";
      socket.write(encodeImeiHandshakeFrame(imei));
      const imeiResponse = await readBytes(socket, 1);
      expect(Array.from(imeiResponse)).toEqual([0x01]);

      const validPacket = buildDryRunPacket();
      socket.write(validPacket);
      const avlAck = await readBytes(socket, 4);
      expect(avlAck.toString("hex")).toBe("00000001");

      const malformedPacket = Buffer.from(validPacket);
      malformedPacket[malformedPacket.length - 1] ^= 0xff;
      socket.write(malformedPacket);

      const malformedAck = await readBytesWithTimeout(socket, 4, 150);
      expect(malformedAck).toBeNull();

      await waitFor(() => store.decodeFailures.length === 1);

      const failure = store.decodeFailures[0];
      expect(failure?.imei).toBe(imei);
      expect(failure?.rawFrame.toString("hex")).toBe(malformedPacket.toString("hex"));
      expect(failure?.error.kind).toBe("crc_mismatch");
      expect(failure?.error.message).toContain("CRC");
    } finally {
      socket.destroy();
    }
  });

  it("keeps dry-run output deterministic for a fixed route, style, seed, and interval", () => {
    const config = createDryRunConfig();

    const first = createDryRunOutput(config);
    const second = createDryRunOutput(config);

    expect(first).toEqual(second);
  });

  async function useBackend(): Promise<DashboardBackend> {
    const store = new RecordingFrameIngestStore();
    const backend = await startDashboardBackend({
      host: "127.0.0.1",
      port: 0,
      webHost: "127.0.0.1",
      webPort: 0,
      acceptImei: true
    }, store);
    backends.push(backend);
    stores.set(backend, store);
    return backend;
  }

  function storeFor(backend: DashboardBackend): RecordingFrameIngestStore {
    const store = stores.get(backend);
    if (!store) throw new Error("Missing test frame store.");
    return store;
  }
});

class RecordingFrameIngestStore implements FrameIngestStore {
  readonly frames: FrameIngestInput[] = [];
  readonly decodeFailures: FrameDecodeFailureInput[] = [];

  async persistFrame(input: FrameIngestInput): Promise<void> {
    this.frames.push(input);
  }

  async auditDecodeFailure(input: FrameDecodeFailureInput): Promise<void> {
    this.decodeFailures.push(input);
  }
}

function createDryRunConfig() {
  const result = parseConfig(
    [
      "--host",
      "127.0.0.1",
      "--port",
      "5027",
      "--imei",
      "123456789012345",
      "--route-file",
      routeFile,
      "--seed",
      "7",
      "--interval-ms",
      "1000",
      "--count",
      "2",
      "--dry-run",
      "--driving-style",
      "normal"
    ],
    {}
  );

  if (result.kind !== "simulator") {
    throw new Error("expected dry-run simulator config");
  }

  return result.config;
}

function buildDryRunPacket(): Buffer {
  const result = parseConfig(
    [
      "--host",
      "127.0.0.1",
      "--port",
      "5027",
      "--imei",
      "123456789012345",
      "--route-file",
      routeFile,
      "--seed",
      "7",
      "--interval-ms",
      "1000",
      "--count",
      "1",
      "--dry-run",
      "--driving-style",
      "normal"
    ],
    {}
  );
  if (result.kind !== "simulator") {
    throw new Error("expected simulator config");
  }

  const output = createDryRunOutput(result.config);
  const firstPacket = output.stdoutLines[0];
  if (!firstPacket) {
    throw new Error("expected dry-run packet");
  }

  return Buffer.from(firstPacket, "hex");
}

function connectSocket(host: string, port: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port });
    socket.once("error", reject);
    socket.once("connect", () => {
      socket.off("error", reject);
      // Keep late peer resets from escaping Vitest as unhandled socket errors.
      socket.on("error", () => {});
      resolve(socket);
    });
  });
}

function readBytes(socket: Socket, size: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);

    const onData = (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length < size) {
        return;
      }

      cleanup();
      const value = buffer.subarray(0, size);
      const remainder = buffer.subarray(size);
      if (remainder.length > 0) {
        socket.unshift(remainder);
      }
      resolve(value);
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const onClose = () => {
      cleanup();
      reject(new Error("Socket closed before enough data was received."));
    };

    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("close", onClose);
    };

    socket.on("data", onData);
    socket.once("error", onError);
    socket.once("close", onClose);
  });
}

async function readBytesWithTimeout(socket: Socket, size: number, timeoutMs: number): Promise<Buffer | null> {
  return await Promise.race([
    readBytes(socket, size),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs))
  ]);
}

async function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMs = 1_000): Promise<void> {
  const startedAt = Date.now();

  while (!(await predicate())) {
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error("Timed out waiting for condition.");
    }

    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
}
