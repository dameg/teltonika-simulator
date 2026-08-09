import { createConnection, createServer, type AddressInfo, type Server, type Socket } from "node:net";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createDryRunOutput,
  encodeImeiHandshakeFrame,
  formatAddressPort,
  formatHttpUrl,
  parseConfig,
  performImeiHandshake,
  runLiveSession,
  startDashboardBackend,
  type DashboardBackend
} from "../src";
import type {
  FrameDecodeFailureInput,
  FrameIngestInput,
  FrameIngestStore,
} from "../src/frame-ingest-store";

const routeFile = join(__dirname, "fixtures", "city-loop.route.json");

describe("dashboard backend", () => {
  const backends: DashboardBackend[] = [];
  const stores = new WeakMap<DashboardBackend, RecordingFrameIngestStore>();

  afterEach(async () => {
    await Promise.allSettled(backends.splice(0).map((backend) => backend.close()));
  });

  it("formats ipv6 launch addresses with brackets", () => {
    expect(formatAddressPort({ address: "::1", port: 9000 })).toBe("[::1]:9000");
    expect(formatHttpUrl({ address: "::1", port: 8080 })).toBe("http://[::1]:8080/");
  });

  it("serves a health response without exposing an in-memory message API", async () => {
    const backend = await useBackend();

    const response = await fetch(formatHttpUrl(backend.webAddress));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({ status: "ok" });

    const messagesResponse = await fetch(new URL("/messages", formatHttpUrl(backend.webAddress)));
    expect(messagesResponse.status).toBe(404);
  });

  it("passes accepted decoded AVL frames to the injected store", async () => {
    const backend = await useBackend();
    const store = storeFor(backend);
    const controller = new AbortController();
    const sessionPromise = runLiveSession({
      host: backend.tcpAddress.address,
      port: backend.tcpAddress.port,
      imei: "123456789012345",
      intervalMs: 25,
      routeFile,
      drivingStyle: "normal",
      seed: 7,
      deviceProfile: "default-codec8e",
      signal: controller.signal
    });

    await waitFor(() => store.frames.length > 0);
    controller.abort();
    await expect(sessionPromise).resolves.toEqual({ kind: "completed" });

    expect(store.frames).toHaveLength(1);
    expect(store.frames[0]).toMatchObject({
      imei: "123456789012345"
    });
    expect(store.frames[0]?.decoded.recordCount).toBe(1);
    expect(store.frames[0]?.decoded.records).toHaveLength(1);
    expect(store.frames[0]?.rawFrame.toString("hex")).toMatch(/^[0-9a-f]+$/);
  });

  it("rejects imei handshakes when configured", async () => {
    const backend = await useBackend({ acceptImei: false });

    await expect(
      performImeiHandshake({
        host: backend.tcpAddress.address,
        port: backend.tcpAddress.port,
        imei: "123456789012345"
      })
    ).resolves.toEqual({ kind: "rejected" });

    expect(storeFor(backend).frames).toEqual([]);
  });

  it("rejects malformed IMEIs before accepting telemetry", async () => {
    const backend = await useBackend();

    await expect(performImeiHandshake({
      host: backend.tcpAddress.address,
      port: backend.tcpAddress.port,
      imei: "not-an-imei",
    })).resolves.toEqual({ kind: "rejected" });
    expect(storeFor(backend).frames).toEqual([]);
  });

  it("parses fragmented AVL frames and audits decoder errors without acknowledging them", async () => {
    const backend = await useBackend();
    const store = storeFor(backend);
    const socket = await connectSocket(backend.tcpAddress.address, backend.tcpAddress.port);

    try {
      socket.write(encodeImeiHandshakeFrame("123456789012345"));
      expect(await readBytes(socket, 1)).toEqual(Buffer.from([0x01]));

      const validPacket = buildDryRunPacket();
      const invalidPacket = Buffer.from(validPacket);
      invalidPacket[invalidPacket.length - 1] ^= 0xff;

      socket.write(validPacket.subarray(0, 5));
      socket.write(validPacket.subarray(5, 19));
      socket.write(validPacket.subarray(19));
      expect(await readBytes(socket, 4)).toEqual(Buffer.from([0x00, 0x00, 0x00, 0x01]));

      socket.write(invalidPacket);
      expect(await readBytesWithTimeout(socket, 4, 100)).toBeNull();

      await waitFor(() => store.decodeFailures.length === 1);
      expect(store.frames).toHaveLength(1);
      expect(store.decodeFailures[0]).toMatchObject({
        imei: "123456789012345"
      });
      expect(store.decodeFailures[0]?.error.kind).toBe("crc_mismatch");
    } finally {
      socket.destroy();
    }
  });

  it("acknowledges a valid frame only after durable persistence resolves", async () => {
    let releasePersistence = () => {};
    const persistenceGate = new Promise<void>((resolve) => {
      releasePersistence = resolve;
    });
    const store = new RecordingFrameIngestStore();
    store.onPersistFrame = () => persistenceGate;
    const backend = await useBackend({}, store);
    const socket = await connectSocket(backend.tcpAddress.address, backend.tcpAddress.port);

    try {
      socket.write(encodeImeiHandshakeFrame("123456789012345"));
      expect(await readBytes(socket, 1)).toEqual(Buffer.from([0x01]));

      socket.write(buildDryRunPacket());
      let acknowledged = false;
      const acknowledgement = readBytes(socket, 4).then((value) => {
        acknowledged = true;
        return value;
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(acknowledged).toBe(false);

      releasePersistence();
      expect(await acknowledgement).toEqual(Buffer.from([0x00, 0x00, 0x00, 0x01]));
    } finally {
      socket.destroy();
    }
  });

  it("does not acknowledge a valid frame when persistence fails", async () => {
    const store = new RecordingFrameIngestStore();
    store.onPersistFrame = async () => {
      throw new Error("database unavailable");
    };
    const backend = await useBackend({}, store);
    const socket = await connectSocket(backend.tcpAddress.address, backend.tcpAddress.port);

    socket.write(encodeImeiHandshakeFrame("123456789012345"));
    expect(await readBytes(socket, 1)).toEqual(Buffer.from([0x01]));

    const receivedAfterHandshake: Buffer[] = [];
    socket.on("data", (chunk) => receivedAfterHandshake.push(chunk));
    const closed = new Promise<void>((resolve) => socket.once("close", () => resolve()));
    socket.write(buildDryRunPacket());
    await closed;

    expect(Buffer.concat(receivedAfterHandshake)).toHaveLength(0);
    expect(store.frames).toHaveLength(1);
  });

  it("releases a successfully bound TCP port when the health port cannot bind", async () => {
    const targetTcpPort = await findAvailablePort();
    const healthBlocker = createServer();
    await listen(healthBlocker, 0);
    const blockedHealthPort = (healthBlocker.address() as AddressInfo).port;

    try {
      await expect(startDashboardBackend({
        host: "127.0.0.1",
        port: targetTcpPort,
        webHost: "127.0.0.1",
        webPort: blockedHealthPort,
        acceptImei: true,
      }, new RecordingFrameIngestStore())).rejects.toMatchObject({ code: "EADDRINUSE" });

      const probe = createServer();
      await listen(probe, targetTcpPort);
      await closeNetServer(probe);
    } finally {
      await closeNetServer(healthBlocker);
    }
  });

  async function useBackend(
    overrides: Partial<Parameters<typeof startDashboardBackend>[0]> = {},
    store = new RecordingFrameIngestStore(),
  ) {
    const backend = await startDashboardBackend({
      host: "127.0.0.1",
      port: 0,
      webHost: "127.0.0.1",
      webPort: 0,
      acceptImei: true,
      ...overrides
    }, store);
    backends.push(backend);
    stores.set(backend, store);
    return backend;
  }

  function storeFor(backend: DashboardBackend): RecordingFrameIngestStore {
    const store = stores.get(backend);
    if (!store) {
      throw new Error("Missing test frame store.");
    }
    return store;
  }
});

class RecordingFrameIngestStore implements FrameIngestStore {
  readonly frames: FrameIngestInput[] = [];
  readonly decodeFailures: FrameDecodeFailureInput[] = [];
  onPersistFrame?: (input: FrameIngestInput) => Promise<void>;

  async persistFrame(input: FrameIngestInput): Promise<void> {
    this.frames.push(input);
    await this.onPersistFrame?.(input);
  }

  async auditDecodeFailure(input: FrameDecodeFailureInput): Promise<void> {
    this.decodeFailures.push(input);
  }
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

async function waitFor(predicate: () => boolean, timeoutMs = 1_000): Promise<void> {
  const startedAt = Date.now();

  while (!predicate()) {
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error("Timed out waiting for condition.");
    }

    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function findAvailablePort(): Promise<number> {
  const server = createServer();
  await listen(server, 0);
  const port = (server.address() as AddressInfo).port;
  await closeNetServer(server);
  return port;
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function closeNetServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
