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
    });

    server = await startDashboardServer({ host: "127.0.0.1", port: 0 });
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

    const frontendResponse = await fetch(`${baseUrl}/dashboard-app.js`);

    expect(frontendResponse.status).toBe(200);

    const frontendBundle = await frontendResponse.text();
    expect(frontendBundle).toContain("Teltonika Device Control");
    expect(frontendBundle).toContain("Device Registry");

    const healthResponse = await fetch(`${baseUrl}/api/health`);

    expect(healthResponse.status).toBe(200);
    await expect(healthResponse.json()).resolves.toEqual({
      app: "teltonika-device-control-dashboard",
      status: "ok",
    });
  });
});
