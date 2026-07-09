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

  it("lists device statuses including configured devices without runtime state", async () => {
    await createDevice({
      imei: "888888888888888",
      label: "Configured Device",
      enabled: true,
      host: "127.0.0.1",
      port: 65001,
    });

    await createDevice({
      imei: "999999999999999",
      label: "Failed Device",
      enabled: false,
      host: "127.0.0.1",
      port: 65002,
    });
    runtimeRepository.set({
      imei: "999999999999999",
      status: "failed",
      updatedAtMs: 2_000,
      lastStartAtMs: 1_000,
      lastStopAtMs: 2_000,
      lastError: "Socket closed",
    });

    const response = await fetch(`${server.url}/api/status/devices`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      devices: [
        {
          imei: "888888888888888",
          label: "Configured Device",
          enabled: true,
          status: "configured",
        },
        {
          imei: "999999999999999",
          label: "Failed Device",
          enabled: false,
          status: "failed",
          lastStartAtMs: 1_000,
          lastStopAtMs: 2_000,
          lastError: "Socket closed",
        },
      ],
    });
  });

  it("returns an aggregate overview across configured and runtime-backed devices", async () => {
    await createDevice({
      imei: "101010101010101",
      label: "Configured",
      enabled: true,
      host: "127.0.0.1",
      port: 65003,
    });
    await createDevice({
      imei: "202020202020202",
      label: "Failed",
      enabled: true,
      host: "127.0.0.1",
      port: 65004,
    });
    await createDevice({
      imei: "303030303030303",
      label: "Stopped",
      enabled: false,
      host: "127.0.0.1",
      port: 65005,
    });

    runtimeRepository.set({
      imei: "202020202020202",
      status: "failed",
      updatedAtMs: 1_000,
      lastError: "Connection refused",
    });
    runtimeRepository.set({
      imei: "303030303030303",
      status: "stopped",
      updatedAtMs: 2_000,
      lastStopAtMs: 2_000,
    });

    const response = await fetch(`${server.url}/api/status/overview`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      total: 3,
      counts: {
        configured: 1,
        starting: 0,
        running: 0,
        reconnecting: 0,
        stopped: 1,
        rejected: 0,
        failed: 1,
        completed: 0,
      },
    });
  });

  it("ignores runtime-only orphan records in status list and overview", async () => {
    await createDevice({
      imei: "121212121212121",
      label: "Configured Device",
      enabled: true,
      host: "127.0.0.1",
      port: 65011,
    });

    runtimeRepository.set({
      imei: "121212121212121",
      status: "failed",
      updatedAtMs: 2_000,
      lastStartAtMs: 1_000,
      lastStopAtMs: 2_000,
      lastError: "Configured failure",
    });
    runtimeRepository.set({
      imei: "343434343434343",
      status: "stopped",
      updatedAtMs: 4_000,
      lastStartAtMs: 3_000,
      lastStopAtMs: 4_000,
      lastError: "Orphan runtime",
    });

    const devicesResponse = await fetch(`${server.url}/api/status/devices`);
    expect(devicesResponse.status).toBe(200);
    await expect(devicesResponse.json()).resolves.toEqual({
      devices: [
        {
          imei: "121212121212121",
          label: "Configured Device",
          enabled: true,
          status: "failed",
          updatedAtMs: 2_000,
          lastStartAtMs: 1_000,
          lastStopAtMs: 2_000,
          lastError: "Configured failure",
        },
      ],
    });

    const overviewResponse = await fetch(`${server.url}/api/status/overview`);
    expect(overviewResponse.status).toBe(200);
    await expect(overviewResponse.json()).resolves.toEqual({
      total: 1,
      counts: {
        configured: 0,
        starting: 0,
        running: 0,
        reconnecting: 0,
        stopped: 0,
        rejected: 0,
        failed: 1,
        completed: 0,
      },
    });
  });

  it("returns per-device status details", async () => {
    await createDevice({
      imei: "404040404040404",
      label: "Detail Device",
      enabled: true,
      host: "127.0.0.1",
      port: 65006,
    });
    runtimeRepository.set({
      imei: "404040404040404",
      status: "completed",
      updatedAtMs: 9_000,
      lastStartAtMs: 8_000,
      lastStopAtMs: 9_000,
    });

    const response = await fetch(`${server.url}/api/status/devices/404040404040404`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      device: {
        imei: "404040404040404",
        label: "Detail Device",
        enabled: true,
        status: "completed",
        updatedAtMs: 9_000,
        lastStartAtMs: 8_000,
        lastStopAtMs: 9_000,
      },
    });
  });

  it("filters recent logs by device, severity, type, and limit", async () => {
    await createDevice({
      imei: "505050505050505",
      label: "Log Device",
      enabled: true,
      host: "127.0.0.1",
      port: 65007,
    });

    logRepository.append({
      id: "log-1",
      imei: "505050505050505",
      severity: "info",
      type: "simulationStartRequested",
      message: "Started",
      timestampMs: 1_000,
    });
    logRepository.append({
      id: "log-2",
      imei: "505050505050505",
      severity: "warn",
      type: "reconnectAttempted",
      message: "Reconnect 1",
      timestampMs: 2_000,
    });
    logRepository.append({
      id: "log-3",
      severity: "error",
      type: "runFailed",
      message: "Global failure",
      timestampMs: 3_000,
    });
    logRepository.append({
      id: "log-4",
      imei: "505050505050505",
      severity: "warn",
      type: "reconnectAttempted",
      message: "Reconnect 2",
      timestampMs: 4_000,
    });

    const response = await fetch(
      `${server.url}/api/logs?imei=505050505050505&severity=warn&type=reconnectAttempted&limit=1`,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      events: [
        {
          id: "log-4",
          imei: "505050505050505",
          severity: "warn",
          type: "reconnectAttempted",
          message: "Reconnect 2",
          timestampMs: 4_000,
        },
      ],
    });
  });

  it("clears global logs and per-device logs through the api", async () => {
    await createDevice({
      imei: "606060606060606",
      label: "Clear Logs Device",
      enabled: true,
      host: "127.0.0.1",
      port: 65008,
    });
    await createDevice({
      imei: "707070707070707",
      label: "Keep Logs Device",
      enabled: true,
      host: "127.0.0.1",
      port: 65009,
    });

    logRepository.append({
      id: "clear-1",
      imei: "606060606060606",
      severity: "info",
      type: "simulationStartRequested",
      message: "A",
      timestampMs: 1_000,
    });
    logRepository.append({
      id: "clear-2",
      imei: "707070707070707",
      severity: "info",
      type: "simulationStartRequested",
      message: "B",
      timestampMs: 2_000,
    });

    const clearDeviceResponse = await fetch(
      `${server.url}/api/logs/devices/606060606060606`,
      { method: "DELETE" },
    );
    expect(clearDeviceResponse.status).toBe(204);
    expect(logRepository.list({ imei: "606060606060606" })).toEqual([]);
    expect(logRepository.list({ imei: "707070707070707" })).toHaveLength(1);

    const clearAllResponse = await fetch(`${server.url}/api/logs`, { method: "DELETE" });
    expect(clearAllResponse.status).toBe(204);
    expect(logRepository.list()).toEqual([]);
  });

  it("clears dashboard-owned in-memory state when no runs are active", async () => {
    await createDevice({
      imei: "808080808080808",
      label: "Clear State Device",
      enabled: true,
      host: "127.0.0.1",
      port: 65010,
    });
    runtimeRepository.set({
      imei: "808080808080808",
      status: "failed",
      updatedAtMs: 1_000,
      lastError: "boom",
    });
    logRepository.append({
      id: "state-1",
      imei: "808080808080808",
      severity: "error",
      type: "runFailed",
      message: "boom",
      timestampMs: 1_000,
    });

    const response = await fetch(`${server.url}/api/status/state`, { method: "DELETE" });
    expect(response.status).toBe(204);
    expect(deviceRepository.list()).toEqual([]);
    expect(runtimeRepository.list()).toEqual([]);
    expect(logRepository.list()).toEqual([]);
  });

  it("rejects dashboard state clear while a run is active", async () => {
    const backend = await useBackend();
    const imei = "909090909090909";

    await createDevice({
      imei,
      label: "Active State Device",
      enabled: true,
      host: backend.tcpAddress.address,
      port: backend.tcpAddress.port,
      packetCount: 6,
    });

    const startResponse = await fetch(`${server.url}/api/runtime/devices/${imei}/start`, {
      method: "POST",
    });
    expect(startResponse.status).toBe(200);

    await waitFor(() => {
      const status = runtimeRepository.get(imei)?.status;
      return status === "starting" || status === "running" || status === "reconnecting";
    });

    const clearResponse = await fetch(`${server.url}/api/status/state`, {
      method: "DELETE",
    });
    expect(clearResponse.status).toBe(409);
    await expect(clearResponse.json()).resolves.toEqual({
      error: {
        code: "ACTIVE_RUNS_PRESENT",
        message: `Cannot clear dashboard state while runs are active: ${imei}`,
      },
    });
    expect(deviceRepository.get(imei)).toBeDefined();
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
