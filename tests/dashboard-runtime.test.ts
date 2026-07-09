import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import { dirname, join, resolve } from "node:path";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  InMemoryDashboardDeviceRepository,
  InMemoryDashboardLogRepository,
  InMemoryDashboardRuntimeRepository,
  startDashboardBackend,
  startDashboardServer,
  type DashboardBackend,
  type DashboardServer,
} from "../src";

const frontendEntry = resolve(process.cwd(), "src/dashboard/frontend/main.tsx");
const frontendOutfile = resolve(process.cwd(), "dist/dashboard/frontend/dashboard-app.js");
const routeFile = join(__dirname, "fixtures", "city-loop.route.json");

describe("dashboard runtime api", () => {
  let server: DashboardServer;
  let deviceRepository: InMemoryDashboardDeviceRepository;
  let runtimeRepository: InMemoryDashboardRuntimeRepository;
  let logRepository: InMemoryDashboardLogRepository;
  const backends: DashboardBackend[] = [];
  const extraServers: Server[] = [];

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
      logLevel: "silent",
    });

    server = await startDashboardServer({ host: "127.0.0.1", port: 0 });
    deviceRepository = server.app.get(InMemoryDashboardDeviceRepository);
    runtimeRepository = server.app.get(InMemoryDashboardRuntimeRepository);
    logRepository = server.app.get(InMemoryDashboardLogRepository);
  });

  beforeEach(() => {
    deviceRepository.clear();
    runtimeRepository.clear();
    logRepository.clear();
  });

  afterEach(async () => {
    await fetch(`${server.url}/api/runtime/stop-all`, { method: "POST" });
    await waitFor(
      () =>
        runtimeRepository
          .list()
          .every((record) => !["starting", "running", "reconnecting"].includes(record.status)),
      1_500,
    );

    await Promise.allSettled(backends.splice(0).map((backend) => backend.close()));
    await Promise.allSettled(
      extraServers.splice(0).map(
        (tcpServer) =>
          new Promise<void>((resolveClose, rejectClose) => {
            tcpServer.close((error) => {
              if (error) {
                rejectClose(error);
                return;
              }

              resolveClose();
            });
          }),
      ),
    );
  });

  afterAll(async () => {
    await server.close();
  });

  it("starts and stops a device and blocks duplicate active starts", async () => {
    const backend = await useBackend();
    const imei = "123456789012345";

    await createDevice({
      imei,
      label: "Runtime Device",
      enabled: true,
      host: backend.tcpAddress.address,
      port: backend.tcpAddress.port,
    });

    const startResponse = await fetch(`${server.url}/api/runtime/devices/${imei}/start`, {
      method: "POST",
    });
    expect(startResponse.status).toBe(200);
    await expect(startResponse.json()).resolves.toMatchObject({
      imei,
      status: "started",
    });

    await waitFor(() => runtimeRepository.get(imei)?.status === "running");

    const duplicateResponse = await fetch(`${server.url}/api/runtime/devices/${imei}/start`, {
      method: "POST",
    });
    expect(duplicateResponse.status).toBe(409);
    await expect(duplicateResponse.json()).resolves.toMatchObject({
      error: { code: "RUN_ALREADY_ACTIVE" },
    });

    const stopResponse = await fetch(`${server.url}/api/runtime/devices/${imei}/stop`, {
      method: "POST",
    });
    expect(stopResponse.status).toBe(200);
    await expect(stopResponse.json()).resolves.toMatchObject({
      imei,
      status: "stopped",
    });

    await waitFor(() => runtimeRepository.get(imei)?.status === "stopped");

    const logTypes = logRepository.list({ imei }).map((event) => event.type);
    expect(logTypes).toContain("simulationStartRequested");
    expect(logTypes).toContain("tcpConnected");
    expect(logTypes).toContain("imeiSent");
    expect(logTypes).toContain("imeiAccepted");
    expect(logTypes).toContain("runStopped");
  });

  it("starts selected devices and stop-all stops each active run", async () => {
    const backend = await useBackend();
    const imeis = ["111111111111111", "222222222222222"];

    for (const imei of imeis) {
      await createDevice({
        imei,
        label: `Selected ${imei}`,
        enabled: true,
        host: backend.tcpAddress.address,
        port: backend.tcpAddress.port,
      });
    }

    const response = await fetch(`${server.url}/api/runtime/start-selected`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imeis }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      results: imeis.map((imei) => ({ imei, status: "started" })),
    });

    await waitFor(() => imeis.every((imei) => runtimeRepository.get(imei)?.status === "running"));

    const stopAllResponse = await fetch(`${server.url}/api/runtime/stop-all`, {
      method: "POST",
    });
    expect(stopAllResponse.status).toBe(200);
    await expect(stopAllResponse.json()).resolves.toMatchObject({
      results: imeis.map((imei) => ({ imei, status: "stopped" })),
    });

    await waitFor(() => imeis.every((imei) => runtimeRepository.get(imei)?.status === "stopped"));
  });

  it("starts all enabled devices and ignores disabled ones", async () => {
    const backend = await useBackend();

    await createDevice({
      imei: "333333333333333",
      label: "Enabled",
      enabled: true,
      host: backend.tcpAddress.address,
      port: backend.tcpAddress.port,
    });
    await createDevice({
      imei: "444444444444444",
      label: "Disabled",
      enabled: false,
      host: backend.tcpAddress.address,
      port: backend.tcpAddress.port,
    });

    const response = await fetch(`${server.url}/api/runtime/start-all-enabled`, {
      method: "POST",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      results: [{ imei: "333333333333333", status: "started" }],
    });

    await waitFor(() => runtimeRepository.get("333333333333333")?.status === "running");
    expect(runtimeRepository.get("444444444444444")).toBeUndefined();
  });

  it("marks runs as rejected when the server rejects the imei", async () => {
    const backend = await useBackend({ acceptImei: false });
    const imei = "555555555555555";

    await createDevice({
      imei,
      label: "Rejected Device",
      enabled: true,
      host: backend.tcpAddress.address,
      port: backend.tcpAddress.port,
    });

    const response = await fetch(`${server.url}/api/runtime/devices/${imei}/start`, {
      method: "POST",
    });
    expect(response.status).toBe(200);

    await waitFor(() => runtimeRepository.get(imei)?.status === "rejected");
    expect(logRepository.list({ imei }).some((event) => event.type === "imeiRejected")).toBe(true);
  });

  it("marks runs as failed on non-reconnectable session errors", async () => {
    const serverWithBadAck = await useBadAckServer();
    const address = serverWithBadAck.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected tcp server address.");
    }

    const imei = "666666666666666";

    await createDevice({
      imei,
      label: "Failure Device",
      enabled: true,
      host: "127.0.0.1",
      port: address.port,
    });

    const response = await fetch(`${server.url}/api/runtime/devices/${imei}/start`, {
      method: "POST",
    });
    expect(response.status).toBe(200);

    await waitFor(() => runtimeRepository.get(imei)?.status === "failed");
    expect(runtimeRepository.get(imei)?.lastError).toBeTruthy();
    expect(logRepository.list({ imei }).some((event) => event.type === "runFailed")).toBe(true);
  });

  it("records reconnect attempts without logging a premature failure", async () => {
    const backend = await useBackend();
    const imei = "777777777777777";

    await createDevice({
      imei,
      label: "Reconnect Device",
      enabled: true,
      host: backend.tcpAddress.address,
      port: backend.tcpAddress.port,
      packetCount: 10,
    });

    const response = await fetch(`${server.url}/api/runtime/devices/${imei}/start`, {
      method: "POST",
    });
    expect(response.status).toBe(200);

    await waitFor(() => runtimeRepository.get(imei)?.status === "running");
    await backend.close();

    await waitFor(() => runtimeRepository.get(imei)?.status === "reconnecting");
    expect(logRepository.list({ imei }).some((event) => event.type === "reconnectAttempted")).toBe(true);
    expect(logRepository.list({ imei }).some((event) => event.type === "runFailed")).toBe(false);
  });

  async function useBackend(
    overrides: Partial<Parameters<typeof startDashboardBackend>[0]> = {},
  ): Promise<DashboardBackend> {
    const backend = await startDashboardBackend({
      host: "127.0.0.1",
      port: 0,
      webHost: "127.0.0.1",
      webPort: 0,
      acceptImei: true,
      ...overrides,
    });
    backends.push(backend);
    return backend;
  }

  async function useBadAckServer(): Promise<Server> {
    const tcpServer = createServer((socket) => {
      let handshakeAccepted = false;

      socket.on("data", (chunk) => {
        if (!handshakeAccepted) {
          handshakeAccepted = true;
          socket.write(Buffer.from([0x01]));
          return;
        }

        if (chunk.length > 0) {
          socket.write(Buffer.from([0x00, 0x00, 0x00, 0x00]));
        }
      });

      socket.on("error", () => {});
    });

    await new Promise<void>((resolveListen, rejectListen) => {
      tcpServer.listen(0, "127.0.0.1", (error?: Error) => {
        if (error) {
          rejectListen(error);
          return;
        }

        resolveListen();
      });
    });

    extraServers.push(tcpServer);
    return tcpServer;
  }

async function createDevice(input: {
  imei: string;
  label: string;
  enabled: boolean;
  host: string;
  port: number;
  packetCount?: number;
}): Promise<void> {
    const response = await fetch(`${server.url}/api/devices`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        imei: input.imei,
        label: input.label,
        enabled: input.enabled,
        config: {
          host: input.host,
          port: input.port,
          intervalMs: 25,
          reconnectDelayMs: 25,
          routeFile,
          drivingStyle: "normal",
          seed: 7,
          deviceProfile: "default-codec8e",
          packetCount: input.packetCount ?? 2,
        },
      }),
    });

    expect(response.status).toBe(201);
  }
});

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 1_000,
): Promise<void> {
  const startedAt = Date.now();

  while (!(await predicate())) {
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error("Timed out waiting for condition.");
    }

    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
}
