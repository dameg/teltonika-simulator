import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "esbuild";

import { startDashboardServer, type DashboardServer } from "../src";

describe("dashboard app shell", () => {
  let server: DashboardServer | undefined;
  let baseUrl = "";

  beforeAll(async () => {
    await build({
      entryPoints: ["src/dashboard/frontend/main.tsx"],
      bundle: true,
      platform: "browser",
      format: "iife",
      outfile: "dist/dashboard/frontend/dashboard-app.js",
      loader: { ".png": "dataurl" },
    });

    server = await startDashboardServer({
      host: "127.0.0.1",
      port: 0,
      tcpPort: 0,
      parserHealthPort: 0,
    });
    baseUrl = server.url;
  });

  afterAll(async () => {
    await server?.close();
  });

  it("serves the dashboard shell and health endpoint", async () => {
    const shellResponse = await fetch(baseUrl);

    expect(shellResponse.status).toBe(200);
    expect(shellResponse.headers.get("content-type")).toContain("text/html");

    const shell = await shellResponse.text();
    expect(shell).toContain("Teltonika Device Control Dashboard");
    expect(shell).toContain('<div id="root">Loading dashboard shell...</div>');
    expect(shell).toContain('<script defer src="/dashboard-app.js"></script>');
    expect(shell).toContain('<link rel="stylesheet" href="/dashboard-app.css">');
    expect(shell).toContain("teltonika-dashboard-color-scheme");
    expect(shell).toContain("prefers-color-scheme: dark");
    expect(shell).toContain("data-mantine-color-scheme");
    expect(shell.indexOf("teltonika-dashboard-color-scheme")).toBeLessThan(
      shell.indexOf('<link rel="stylesheet" href="/dashboard-app.css">'),
    );

    const frontendResponse = await fetch(`${baseUrl}/dashboard-app.js`);

    expect(frontendResponse.status).toBe(200);

    const frontendBundle = await frontendResponse.text();
    expect(frontendBundle).toContain("Teltonika Simulator");
    expect(frontendBundle).toContain("Device setup");
    expect(frontendBundle).toContain("FMC650 test device");
    expect(frontendBundle).toContain("fmc003");
    expect(frontendBundle).toContain("fmc150");
    expect(frontendBundle).toContain("fmc250");
    expect(frontendBundle).toContain("Generate IMEI");
    expect(frontendBundle).toContain("Start all");
    expect(frontendBundle).toContain("Recent logs");
    expect(frontendBundle).toContain("JSON package");
    expect(frontendBundle).toContain("Live & devices");
    expect(frontendBundle).toContain("Live map");
    expect(frontendBundle).toContain("Trip history");
    expect(frontendBundle).toContain("Selected route");
    expect(frontendBundle).toContain("Point telemetry");
    expect(frontendBundle).toContain("Load history");
    expect(frontendBundle).toContain("TCP :5027");
    expect(frontendBundle).toContain("Predefined route");
    expect(frontendBundle).toContain("Simulation speed");
    expect(frontendBundle).toContain("routes/krakow-berlin.route.json");
    expect(frontendBundle).toContain("routes/munich-rome.route.json");
    expect(frontendBundle).toContain("Updates while this drawer is open");
    expect(frontendBundle).toContain("Clear logs");
    expect(frontendBundle).toContain("Clear dashboard state");
    expect(frontendBundle).toContain("Switch to dark mode");
    expect(frontendBundle).toContain("Switch to light mode");
    expect(frontendBundle).toContain("/api/status/devices");
    expect(frontendBundle).toContain("/api/status/overview");
    expect(frontendBundle).toContain("/api/logs?limit=100");
    expect(frontendBundle).toContain("/api/status/state");
    expect(frontendBundle).toContain("/api/status/positions");
    expect(frontendBundle).toContain("/api/history/devices/");
    expect(frontendBundle).toContain("/api/history/trips/");

    const healthResponse = await fetch(`${baseUrl}/api/health`);

    expect(healthResponse.status).toBe(200);
    await expect(healthResponse.json()).resolves.toEqual({
      app: "teltonika-device-control-dashboard",
      status: "ok",
    });
  });
});
