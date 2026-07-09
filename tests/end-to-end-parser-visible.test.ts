import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { createConnection, type Socket } from "node:net";
import { dirname, resolve } from "node:path";
import { join } from "node:path";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  createDryRunOutput,
  encodeImeiHandshakeFrame,
  formatHttpUrl,
  InMemoryDashboardLogRepository,
  parseConfig,
  startDashboardBackend,
  startDashboardServer,
  type DashboardBackend,
  type DashboardServer,
  type DashboardMessage
} from "../src";

const frontendEntry = resolve(process.cwd(), "src/dashboard/frontend/main.tsx");
const frontendOutfile = resolve(process.cwd(), "dist/dashboard/frontend/dashboard-app.js");
const routeFile = join(__dirname, "fixtures", "city-loop.route.json");

describe("end-to-end parser-visible coverage", () => {
  const backends: DashboardBackend[] = [];
  let dashboardServer: DashboardServer;
  let logRepository: InMemoryDashboardLogRepository;

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
      logLevel: "silent"
    });

    dashboardServer = await startDashboardServer({ host: "127.0.0.1", port: 0 });
    logRepository = dashboardServer.app.get(InMemoryDashboardLogRepository);
  });

  afterEach(async () => {
    await Promise.allSettled(backends.splice(0).map((backend) => backend.close()));
  });

  afterAll(async () => {
    await dashboardServer.close();
  });

  it("surfaces accepted imei and decoded avl packets through the dashboard messages api", async () => {
    const backend = await useBackend();
    const imei = "123456789012345";

    const createResponse = await fetch(`${dashboardServer.url}/api/devices`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        imei,
        label: "Parser Coverage Device",
        enabled: true,
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

    await waitFor(async () => {
      const messages = await fetchMessages(backend);
      return messages.some((message) => message.type === "avl");
    }, 3_000);

    const messages = await fetchMessages(backend);
    expect(messages).toHaveLength(2);

    const logTypes = logRepository.list({ imei }).map((event) => event.type);
    expect(logTypes).toContain("tcpConnected");
    expect(logTypes).toContain("imeiSent");
    expect(logTypes).toContain("imeiAccepted");

    const [imeiMessage, avlMessage] = messages;
    expect(imeiMessage).toMatchObject({
      type: "imei",
      imei,
      accepted: true
    });
    expect(imeiMessage?.rawHex).toBe(Buffer.from(encodeImeiHandshakeFrame(imei)).toString("hex"));

    expect(avlMessage?.type).toBe("avl");
    if (!avlMessage || avlMessage.type !== "avl") {
      throw new Error("expected avl message");
    }

    expect(avlMessage.imei).toBe(imei);
    expect(avlMessage.rawHex).toMatch(/^[0-9a-f]+$/);
    expect(avlMessage.decoded.codecId).toBe(0x8e);
    expect(avlMessage.decoded.recordCount).toBeGreaterThan(0);
    expect(avlMessage.decoded.records[0]?.gps.longitude).toBeTypeOf("number");
    expect(avlMessage.decoded.records[0]?.gps.latitude).toBeTypeOf("number");

    const stopResponse = await fetch(`${dashboardServer.url}/api/runtime/devices/${imei}/stop`, {
      method: "POST"
    });
    expect(stopResponse.status).toBe(200);
  });

  it("surfaces malformed packets as parser-visible dashboard errors without duplicating parser logic", async () => {
    const backend = await useBackend();
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

      await waitFor(async () => {
        const messages = await fetchMessages(backend);
        return messages.length >= 3;
      });

      const messages = await fetchMessages(backend);
      expect(messages.map((message) => message.type)).toEqual(["imei", "avl", "error"]);

      const errorMessage = messages[2];
      expect(errorMessage?.type).toBe("error");
      if (!errorMessage || errorMessage.type !== "error") {
        throw new Error("expected error message");
      }

      expect(errorMessage.imei).toBe(imei);
      expect(errorMessage.rawHex).toBe(malformedPacket.toString("hex"));
      expect(errorMessage.error.kind).toBe("crc_mismatch");
      expect(errorMessage.error.message).toContain("CRC");
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
    const backend = await startDashboardBackend({
      host: "127.0.0.1",
      port: 0,
      webHost: "127.0.0.1",
      webPort: 0,
      acceptImei: true
    });
    backends.push(backend);
    return backend;
  }
});

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

async function fetchMessages(backend: DashboardBackend): Promise<DashboardMessage[]> {
  const response = await fetch(new URL("/messages", formatHttpUrl(backend.webAddress)));
  expect(response.status).toBe(200);
  const payload = (await response.json()) as { messages: DashboardMessage[] };
  return payload.messages;
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
