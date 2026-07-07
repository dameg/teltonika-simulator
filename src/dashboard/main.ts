import "reflect-metadata";

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";

import { AppModule } from "./app.module";
import { AppService } from "./app.service";

export interface DashboardServerOptions {
  host?: string;
  port?: number;
  rootDir?: string;
}

export interface DashboardServer {
  app: NestExpressApplication;
  close(): Promise<void>;
  url: string;
}

export async function createDashboardApp(
  rootDir = process.cwd()
): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: false
  });
  const appService = app.get(AppService);

  appService.assertFrontendBundle(rootDir);
  app.useStaticAssets(appService.getFrontendDirectory(rootDir));

  return app;
}

export async function startDashboardServer(
  options: DashboardServerOptions = {}
): Promise<DashboardServer> {
  const host = options.host ?? process.env.DASHBOARD_HOST ?? "127.0.0.1";
  const port = options.port ?? parsePort(process.env.DASHBOARD_PORT) ?? 3000;
  const app = await createDashboardApp(options.rootDir);

  await app.listen(port, host);

  return {
    app,
    url: await app.getUrl(),
    async close() {
      await app.close();
    }
  };
}

function parsePort(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid DASHBOARD_PORT value: ${value}`);
  }

  return parsed;
}

async function runDashboard(): Promise<void> {
  const logger = new Logger("DashboardBootstrap");
  const server = await startDashboardServer();

  logger.log(`Dashboard available at ${server.url}`);

  const close = async () => {
    await server.close();
    process.exit(0);
  };

  process.once("SIGINT", () => void close());
  process.once("SIGTERM", () => void close());
}

if (require.main === module) {
  void runDashboard().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
