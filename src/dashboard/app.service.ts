import { Injectable } from "@nestjs/common";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

@Injectable()
export class AppService {
  getHealth() {
    return {
      status: "ok",
      app: "teltonika-device-control-dashboard"
    };
  }

  getFrontendDirectory(rootDir = process.cwd()): string {
    return resolve(rootDir, "dist/dashboard/frontend");
  }

  getFrontendBundlePath(rootDir = process.cwd()): string {
    return resolve(this.getFrontendDirectory(rootDir), "dashboard-app.js");
  }

  assertFrontendBundle(rootDir = process.cwd()): void {
    const bundlePath = this.getFrontendBundlePath(rootDir);
    if (!existsSync(bundlePath)) {
      throw new Error(
        `Dashboard frontend bundle not found at ${bundlePath}. Run "npm run build" before starting the dashboard.`
      );
    }
  }

  renderShellHtml(): string {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Teltonika Device Control Dashboard</title>
  </head>
  <body>
    <div id="root">Loading dashboard shell...</div>
    <script defer src="/dashboard-app.js"></script>
  </body>
</html>`;
  }
}
