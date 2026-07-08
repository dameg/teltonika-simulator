import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  InMemoryDashboardDeviceRepository,
  InMemoryDashboardLogRepository,
  InMemoryDashboardRuntimeRepository,
  startDashboardServer,
  type DashboardServer
} from "../src";

const frontendEntry = resolve(process.cwd(), "src/dashboard/frontend/main.tsx");
const frontendOutfile = resolve(process.cwd(), "dist/dashboard/frontend/dashboard-app.js");
const routeFile = "tests/fixtures/city-loop.route.json";

describe("dashboard device management API", () => {
  let server: DashboardServer;
  let deviceRepository: InMemoryDashboardDeviceRepository;
  let logRepository: InMemoryDashboardLogRepository;
  let runtimeRepository: InMemoryDashboardRuntimeRepository;

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

    server = await startDashboardServer({ host: "127.0.0.1", port: 0 });
    deviceRepository = server.app.get(InMemoryDashboardDeviceRepository);
    logRepository = server.app.get(InMemoryDashboardLogRepository);
    runtimeRepository = server.app.get(InMemoryDashboardRuntimeRepository);
  });

  beforeEach(() => {
    deviceRepository.clear();
    logRepository.clear();
    runtimeRepository.clear();
  });

  afterAll(async () => {
    await server.close();
  });

  it("creates, lists, updates, and deletes devices", async () => {
    const createResponse = await fetch(`${server.url}/api/devices`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        imei: "123456789012345",
        label: "Truck 01",
        enabled: true,
        config: createDeviceConfig()
      })
    });

    expect(createResponse.status).toBe(201);
    const createdBody = await createResponse.json();
    expect(createdBody.device).toMatchObject({
      imei: "123456789012345",
      label: "Truck 01",
      enabled: true
    });

    const listResponse = await fetch(`${server.url}/api/devices`);
    expect(listResponse.status).toBe(200);
    const listBody = await listResponse.json();
    expect(listBody.devices).toHaveLength(1);

    const updateResponse = await fetch(`${server.url}/api/devices/123456789012345`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        label: "Truck 01 Updated",
        enabled: false
      })
    });

    expect(updateResponse.status).toBe(200);
    const updatedBody = await updateResponse.json();
    expect(updatedBody.device).toMatchObject({
      imei: "123456789012345",
      label: "Truck 01 Updated",
      enabled: false
    });

    const deleteResponse = await fetch(`${server.url}/api/devices/123456789012345`, {
      method: "DELETE"
    });
    expect(deleteResponse.status).toBe(204);

    const emptyListResponse = await fetch(`${server.url}/api/devices`);
    const emptyListBody = await emptyListResponse.json();
    expect(emptyListBody.devices).toHaveLength(0);
  });

  it("bulk imports IMEIs from pasted text with default config", async () => {
    const importResponse = await fetch(`${server.url}/api/devices/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        imeis: "111111111111111,\n222222222222222\n333333333333333"
      })
    });

    expect(importResponse.status).toBe(201);
    const importBody = await importResponse.json();
    expect(importBody.devices).toHaveLength(3);
    expect(importBody.devices[0]).toMatchObject({
      imei: "111111111111111",
      label: "Imported Device 1",
      enabled: true,
      config: {
        host: "127.0.0.1",
        port: 5027,
        intervalMs: 1000,
        reconnectDelayMs: 3000,
        drivingStyle: "normal",
        seed: 1,
        deviceProfile: "default-codec8e"
      }
    });
  });

  it("fails clearly for invalid or duplicate imported IMEIs without partial writes", async () => {
    const invalidResponse = await fetch(`${server.url}/api/devices/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        imeis: "444444444444444,not-an-imei"
      })
    });

    expect(invalidResponse.status).toBe(400);
    const invalidBody = await invalidResponse.json();
    expect(invalidBody.error).toMatchObject({
      code: "INVALID_IMEI"
    });

    const duplicateResponse = await fetch(`${server.url}/api/devices/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        imeis: "555555555555555,555555555555555"
      })
    });

    expect(duplicateResponse.status).toBe(409);
    const duplicateBody = await duplicateResponse.json();
    expect(duplicateBody.error).toMatchObject({
      code: "DUPLICATE_IMEI"
    });

    const listResponse = await fetch(`${server.url}/api/devices`);
    const listBody = await listResponse.json();
    expect(listBody.devices.map((device: { imei: string }) => device.imei)).not.toContain(
      "444444444444444"
    );
    expect(listBody.devices.map((device: { imei: string }) => device.imei)).not.toContain(
      "555555555555555"
    );

    const blankEntryResponse = await fetch(`${server.url}/api/devices/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        imeis: "666666666666666,,777777777777777"
      })
    });

    expect(blankEntryResponse.status).toBe(400);
    const blankEntryBody = await blankEntryResponse.json();
    expect(blankEntryBody.error).toMatchObject({
      code: "EMPTY_IMEI"
    });

    const afterBlankListResponse = await fetch(`${server.url}/api/devices`);
    const afterBlankListBody = await afterBlankListResponse.json();
    expect(afterBlankListBody.devices.map((device: { imei: string }) => device.imei)).not.toContain(
      "666666666666666"
    );
    expect(afterBlankListBody.devices.map((device: { imei: string }) => device.imei)).not.toContain(
      "777777777777777"
    );
  });

  it("blocks updates and deletes while a device is running", async () => {
    await fetch(`${server.url}/api/devices`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        imei: "999999999999999",
        label: "Running Device",
        enabled: true,
        config: createDeviceConfig()
      })
    });

    runtimeRepository.set({
      imei: "999999999999999",
      status: "running",
      updatedAtMs: Date.now()
    });

    const updateResponse = await fetch(`${server.url}/api/devices/999999999999999`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: "Should Fail" })
    });

    expect(updateResponse.status).toBe(409);
    const updateBody = await updateResponse.json();
    expect(updateBody.error).toMatchObject({
      code: "DEVICE_RUNNING"
    });

    const deleteResponse = await fetch(`${server.url}/api/devices/999999999999999`, {
      method: "DELETE"
    });

    expect(deleteResponse.status).toBe(409);
    const deleteBody = await deleteResponse.json();
    expect(deleteBody.error).toMatchObject({
      code: "DEVICE_RUNNING"
    });
  });
});

function createDeviceConfig() {
  return {
    host: "127.0.0.1",
    port: 5027,
    intervalMs: 1000,
    reconnectDelayMs: 3000,
    routeFile,
    drivingStyle: "normal",
    seed: 42,
    deviceProfile: "default-codec8e",
    packetCount: 2
  };
}
