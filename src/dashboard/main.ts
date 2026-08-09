import "reflect-metadata";

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";

import { startDashboardBackend, type DashboardBackend } from "../dashboard-backend";
import { AppModule } from "./app.module";
import { AppService } from "./app.service";
import { PostgresFrameStore } from "./persistence/frame-store";

export interface DashboardServerOptions {
  host?: string;
  port?: number;
  rootDir?: string;
  tcpHost?: string;
  tcpPort?: number;
  parserHealthHost?: string;
  parserHealthPort?: number;
}

export interface DashboardServer {
  app: NestExpressApplication;
  parser: DashboardBackend;
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
  let parser: DashboardBackend;
  try {
    parser = await startDashboardBackend(
      {
        host: options.tcpHost ?? process.env.TELTONIKA_TCP_HOST ?? "127.0.0.1",
        port: options.tcpPort ?? parsePort(process.env.TELTONIKA_TCP_PORT) ?? 5027,
        webHost: options.parserHealthHost ?? process.env.TELTONIKA_PARSER_HEALTH_HOST ?? "127.0.0.1",
        webPort: options.parserHealthPort ?? parsePort(process.env.TELTONIKA_PARSER_HEALTH_PORT) ?? 3001,
        acceptImei: true,
      },
      app.get(PostgresFrameStore),
    );
  } catch (error) {
    await app.close();
    throw error;
  }

  return {
    app,
    parser,
    url: await app.getUrl(),
    async close() {
      await parser.close();
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
  logger.log(`Teltonika parser listening at ${formatTcpAddress(server.parser.tcpAddress)}`);

  const close = async () => {
    await server.close();
    process.exit(0);
  };

  process.once("SIGINT", () => void close());
  process.once("SIGTERM", () => void close());
}

function formatTcpAddress(address: { address: string; port: number }): string {
  const host = address.address.includes(":") ? `[${address.address}]` : address.address;
  return `tcp://${host}:${address.port}`;
}

if (require.main === module) {
  void runDashboard().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
