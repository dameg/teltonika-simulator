import { context } from "esbuild";
import { resolve } from "node:path";

import { startDashboardBackend } from "../dashboard-backend";
import { startDashboardServer } from "./main";

const rootDir = process.cwd();

async function main(): Promise<void> {
  const frontend = await context({
    bundle: true,
    entryPoints: [resolve(rootDir, "src/dashboard/frontend/main.tsx")],
    format: "iife",
    loader: { ".png": "dataurl" },
    outfile: resolve(rootDir, "dist/dashboard/frontend/dashboard-app.js"),
    platform: "browser"
  });

  await frontend.rebuild();
  await frontend.watch();

  const parser = await startDashboardBackend({
    host: "127.0.0.1",
    port: 5027,
    webHost: "127.0.0.1",
    webPort: 3001,
    acceptImei: true
  });
  const server = await startDashboardServer({ rootDir });
  console.log(`Dashboard development server available at ${server.url}`);
  console.log("Teltonika parser available at tcp://127.0.0.1:5027");

  const stop = async (): Promise<void> => {
    await Promise.all([frontend.dispose(), parser.close(), server.close()]);
  };

  process.once("SIGINT", () => void stop().finally(() => process.exit(0)));
  process.once("SIGTERM", () => void stop().finally(() => process.exit(0)));
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
