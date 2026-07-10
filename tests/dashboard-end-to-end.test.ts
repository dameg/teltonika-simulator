import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  decodeCodec8ExtendedPacket,
  startDashboardServer,
  type DashboardServer,
} from "../src";
import {
  startTeltonikaParserFixture,
  type TeltonikaParserFixture,
} from "./fixtures/teltonika-parser-fixture";

const frontendEntry = resolve(process.cwd(), "src/dashboard/frontend/main.tsx");
const frontendOutfile = resolve(process.cwd(), "dist/dashboard/frontend/dashboard-app.js");
const routeFile = join(__dirname, "fixtures", "city-loop.route.json");

describe("dashboard end-to-end coverage", () => {
  let server: DashboardServer | undefined;
  let parser: TeltonikaParserFixture | undefined;

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
  });

  afterEach(async () => {
    if (server) {
      await fetch(`${server.url}/api/runtime/stop-all`, { method: "POST" }).catch(() => undefined);
      await server.close();
      server = undefined;
    }
    await parser?.close();
    parser = undefined;
  });

  afterAll(async () => {
    await server?.close();
    await parser?.close();
  });

  it("runs a created device through the parser and exposes status and lifecycle logs", async () => {
    parser = await startTeltonikaParserFixture();
    server = await startDashboardServer({ host: "127.0.0.1", port: 0 });
    const imei = "123456789012345";

    expect((await createDevice(imei, "Parser-visible device")).status).toBe(201);
    const startResponse = await fetch(`${server.url}/api/runtime/devices/${imei}/start`, {
      method: "POST",
    });
    expect(startResponse.status).toBe(200);

    const imeiFrame = await parser.waitForImeiFrame();
    const avlFrame = await parser.waitForAvlFrame();
    expect(imeiFrame.imei).toBe(imei);
    expect(parser.avlFrameRecords[0]).toMatchObject({
      connectionId: imeiFrame.connectionId,
      imei,
    });

    const decoded = decodeCodec8ExtendedPacket(avlFrame);
    expect(decoded).toMatchObject({ ok: true, packet: { codecId: 0x8e, recordCount: 1 } });
    if (!decoded.ok) throw new Error(decoded.error.message);
    expect(decoded.packet.records[0]?.gps.latitude).toBeTypeOf("number");

    await waitForStatus(imei, (status) => status === "running");
    const runningLogs = await logs(imei);
    expect(runningLogs.events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "simulationStartRequested",
        "tcpConnected",
        "imeiSent",
        "imeiAccepted",
        "avlPacketSent",
        "avlAcknowledged",
      ]),
    );

    const stopResponse = await fetch(`${server.url}/api/runtime/devices/${imei}/stop`, {
      method: "POST",
    });
    expect(stopResponse.status).toBe(200);
    await waitForStatus(imei, (status) => ["stopped", "completed"].includes(status));
    expect((await logs(imei)).events.map((event) => event.type)).toContain("runStopped");
  });

  it("bulk-imports and runs two devices concurrently, then clears visible state", async () => {
    parser = await startTeltonikaParserFixture();
    server = await startDashboardServer({ host: "127.0.0.1", port: 0 });
    const imeis = ["111111111111111", "222222222222222"];

    const importResponse = await fetch(`${server.url}/api/devices/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        imeis: imeis.join("\n"),
        config: deviceConfig(),
      }),
    });
    expect(importResponse.status).toBe(201);
    await Promise.all(
      imeis.map((imei) =>
        fetch(`${server!.url}/api/devices/${imei}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ config: deviceConfig() }),
        }),
      ),
    );

    const startResponse = await fetch(`${server.url}/api/runtime/start-selected`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imeis }),
    });
    expect(startResponse.status).toBe(200);

    await parser.waitForImeiFrame(2);
    await parser.waitForAvlFrame(2);
    expect(new Set(parser.imeiFrames.map((frame) => frame.imei))).toEqual(new Set(imeis));
    expect(new Set(parser.avlFrameRecords.map((frame) => frame.imei))).toEqual(new Set(imeis));
    await Promise.all(imeis.map((imei) => waitForStatus(imei, (status) => status === "running")));

    const statusResponse = await fetch(`${server.url}/api/status/devices`);
    expect(statusResponse.status).toBe(200);
    expect((await statusResponse.json()).devices).toEqual(
      expect.arrayContaining(imeis.map((imei) => expect.objectContaining({ imei, status: "running" }))),
    );
    expect((await logs()).events.map((event) => event.imei)).toEqual(expect.arrayContaining(imeis));

    const stopResponse = await fetch(`${server.url}/api/runtime/stop-all`, { method: "POST" });
    expect(stopResponse.status).toBe(200);
    await Promise.all(imeis.map((imei) => waitForStatus(imei, (status) => ["stopped", "completed"].includes(status))));

    const clearDeviceLogs = await fetch(`${server.url}/api/logs/devices/${imeis[0]}`, { method: "DELETE" });
    expect(clearDeviceLogs.status).toBe(204);
    expect((await logs(imeis[0])).events).toEqual([]);
    const clearLogs = await fetch(`${server.url}/api/logs`, { method: "DELETE" });
    expect(clearLogs.status).toBe(204);
    expect((await logs()).events).toEqual([]);
    const clearState = await fetch(`${server.url}/api/status/state`, { method: "DELETE" });
    expect(clearState.status).toBe(204);
    await expect((await fetch(`${server.url}/api/devices`)).json()).resolves.toEqual({ devices: [] });
  });

  it("does not retain devices, runtime history, or logs after a process-local restart", async () => {
    parser = await startTeltonikaParserFixture();
    server = await startDashboardServer({ host: "127.0.0.1", port: 0 });
    expect((await createDevice("333333333333333", "Restart test")).status).toBe(201);
    const startResponse = await fetch(`${server.url}/api/runtime/devices/333333333333333/start`, {
      method: "POST",
    });
    expect(startResponse.status).toBe(200);
    await parser.waitForImeiFrame();
    expect((await logs()).events.length).toBeGreaterThan(0);
    expect((await fetch(`${server.url}/api/runtime/devices/333333333333333/stop`, { method: "POST" })).status).toBe(200);
    await waitForStatus("333333333333333", (status) => status === "stopped");
    await server.close();
    server = await startDashboardServer({ host: "127.0.0.1", port: 0 });

    expect(await (await fetch(`${server.url}/api/devices`)).json()).toEqual({ devices: [] });
    expect(await (await fetch(`${server.url}/api/status/overview`)).json()).toMatchObject({ total: 0 });
    expect(await (await fetch(`${server.url}/api/logs`)).json()).toEqual({ events: [] });
  });

  async function createDevice(imei: string, label: string): Promise<Response> {
    return fetch(`${server?.url}/api/devices`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imei, label, enabled: true, config: deviceConfig() }),
    });
  }

  function deviceConfig() {
    return {
      host: parser?.host,
      port: parser?.port,
      intervalMs: 25,
      reconnectDelayMs: 25,
      routeFile,
      drivingStyle: "normal",
      seed: 7,
      deviceProfile: "default-codec8e",
    };
  }

  async function waitForStatus(imei: string, predicate: (status: string) => boolean): Promise<void> {
    await waitFor(async () => {
      const response = await fetch(`${server?.url}/api/status/devices/${imei}`);
      return predicate(((await response.json()) as { device: { status: string } }).device.status);
    });
  }

  async function logs(imei?: string): Promise<{ events: Array<{ imei?: string; type: string }> }> {
    const suffix = imei ? `?imei=${imei}` : "";
    const response = await fetch(`${server?.url}/api/logs${suffix}`);
    expect(response.status).toBe(200);
    return response.json() as Promise<{ events: Array<{ imei?: string; type: string }> }>;
  }
});

async function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMs = 3_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await predicate())) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for dashboard state");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
