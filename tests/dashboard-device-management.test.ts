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
      loader: { ".png": "dataurl" },
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
        config: createDeviceConfig()
      })
    });

    expect(createResponse.status).toBe(201);
    const createdBody = await createResponse.json();
    expect(createdBody.device).toMatchObject({
      imei: "123456789012345",
      label: "Truck 01"
    });

    const listResponse = await fetch(`${server.url}/api/devices`);
    expect(listResponse.status).toBe(200);
    const listBody = await listResponse.json();
    expect(listBody.devices).toHaveLength(1);

    const updateResponse = await fetch(`${server.url}/api/devices/123456789012345`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        label: "Truck 01 Updated"
      })
    });

    expect(updateResponse.status).toBe(200);
    const updatedBody = await updateResponse.json();
    expect(updatedBody.device).toMatchObject({
      imei: "123456789012345",
      label: "Truck 01 Updated"
    });

    const deleteResponse = await fetch(`${server.url}/api/devices/123456789012345`, {
      method: "DELETE"
    });
    expect(deleteResponse.status).toBe(204);

    const emptyListResponse = await fetch(`${server.url}/api/devices`);
    const emptyListBody = await emptyListResponse.json();
    expect(emptyListBody.devices).toHaveLength(0);
  });

  it("blocks updates and deletes while a device is running", async () => {
    await fetch(`${server.url}/api/devices`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        imei: "999999999999999",
        label: "Running Device",
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
