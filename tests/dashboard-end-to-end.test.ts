import { build } from "esbuild";

import { startDashboardServer, type DashboardServer } from "../src";
import { DatabaseService } from "../src/dashboard/persistence/database.service";

describe("durable dashboard restart", () => {
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
    await startServer();
  });

  beforeEach(async () => {
    await database.query(`TRUNCATE dashboard_logs, avl_io_elements, avl_records,
      avl_frame_receptions, avl_frames, runs, trips, device_config_revisions,
      simulator_configs, devices RESTART IDENTITY CASCADE`);
  });

  afterAll(async () => {
    await server.close();
  });

  it("keeps a configured device after the dashboard process restarts", async () => {
    const imei = "313131313131313";
    const created = await fetch(`${server.url}/api/devices`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        imei,
        label: "Restart-safe device",
        config: {
          host: "127.0.0.1",
          port: 5027,
          intervalMs: 1_000,
          simulationSpeed: 0,
          reconnectDelayMs: 3_000,
          routeFile: "tests/fixtures/city-loop.route.json",
          drivingStyle: "normal",
          seed: 1,
          deviceProfile: "default-codec8e",
          packetCount: 1,
        },
      }),
    });
    expect(created.status).toBe(201);

    await server.close();
    await startServer();

    const listed = await (await fetch(`${server.url}/api/devices`)).json();
    expect(listed).toMatchObject({
      devices: [expect.objectContaining({ imei, label: "Restart-safe device" })],
    });
    const historyDevices = await (await fetch(`${server.url}/api/history/devices`)).json();
    expect(historyDevices).toMatchObject({
      devices: [expect.objectContaining({ imei, archived: false })],
    });
  });

  async function startServer(): Promise<void> {
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
});
