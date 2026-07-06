import { createConnection, type Socket } from "node:net";
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
  type DashboardBackend,
  type DashboardMessage
} from "../src";

const routeFile = join(__dirname, "fixtures", "city-loop.route.json");

describe("dashboard backend", () => {
  const backends: DashboardBackend[] = [];

  afterEach(async () => {
    await Promise.allSettled(backends.splice(0).map((backend) => backend.close()));
  });

  it("formats ipv6 launch addresses with brackets", () => {
    expect(formatAddressPort({ address: "::1", port: 9000 })).toBe("[::1]:9000");
    expect(formatHttpUrl({ address: "::1", port: 8080 })).toBe("http://[::1]:8080/");
  });

  it("retains accepted imei and decoded avl messages and serves them over http", async () => {
    const backend = await useBackend();
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

    await waitFor(() => backend.getMessages().some((message) => message.type === "avl"));
    controller.abort();
    await expect(sessionPromise).resolves.toEqual({ kind: "completed" });

    const messages = backend.getMessages();
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      type: "imei",
      imei: "123456789012345",
      accepted: true
    });
    expect(messages[1]).toMatchObject({
      type: "avl",
      imei: "123456789012345"
    });
    if (messages[1]?.type !== "avl") {
      throw new Error("expected avl message");
    }

    expect(messages[1].decoded.recordCount).toBe(1);
    expect(messages[1].decoded.records).toHaveLength(1);

    const response = await fetch(`${formatHttpUrl(backend.webAddress)}messages`);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { messages: DashboardMessage[] };
    expect(payload.messages).toHaveLength(2);
    expect(payload.messages[1]).toMatchObject({
      type: "avl",
      imei: "123456789012345"
    });
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

    await waitFor(() => backend.getMessages().length === 1);
    expect(backend.getMessages()[0]).toMatchObject({
      type: "imei",
      imei: "123456789012345",
      accepted: false
    });
  });

  it("parses fragmented avl frames and retains decoder errors for malformed packets", async () => {
    const backend = await useBackend();
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

      await waitFor(() => backend.getMessages().length === 3);
      const messages = backend.getMessages();
      expect(messages.map((message) => message.type)).toEqual(["imei", "avl", "error"]);
      expect(messages[2]).toMatchObject({
        type: "error",
        imei: "123456789012345"
      });
      if (messages[2]?.type !== "error") {
        throw new Error("expected decoder error message");
      }

      expect(messages[2].error.kind).toBe("crc_mismatch");
    } finally {
      socket.destroy();
    }
  });

  async function useBackend(overrides: Partial<Parameters<typeof startDashboardBackend>[0]> = {}) {
    const backend = await startDashboardBackend({
      host: "127.0.0.1",
      port: 0,
      webHost: "127.0.0.1",
      webPort: 0,
      acceptImei: true,
      ...overrides
    });
    backends.push(backend);
    return backend;
  }
});

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
