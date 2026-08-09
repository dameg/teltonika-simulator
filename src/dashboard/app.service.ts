import { Inject, Injectable } from "@nestjs/common";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseService } from "./persistence/database.service";

@Injectable()
export class AppService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  getLiveness() {
    return {
      status: "ok",
      app: "teltonika-device-control-dashboard"
    };
  }

  async getReadiness() {
    return {
      status: await this.database.isReady() ? "ok" : "unavailable",
      database: "postgresql",
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
    <link rel="stylesheet" href="/dashboard-app.css">
  </head>
  <body>
    <div id="root">Loading dashboard shell...</div>
    <script defer src="/dashboard-app.js"></script>
  </body>
</html>`;
  }
}
