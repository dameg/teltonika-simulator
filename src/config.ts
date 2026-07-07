import type { DrivingStyleName } from "./domain";
import { parseDrivingStyleName } from "./driving-style";

export interface SimulatorConfig {
  host: string;
  port: number;
  imeis: string[];
  intervalMs: number;
  reconnectDelayMs: number;
  routeFile?: string;
  drivingStyle: DrivingStyleName;
  seed: number;
  deviceProfile: string;
  dryRun: boolean;
  packetCount?: number;
}

export interface DashboardConfig {
  host: string;
  port: number;
  webHost: string;
  webPort: number;
  acceptImei: boolean;
}

export const helpText = `Usage:
  teltonika-simulator --host <host> --port <port> --imei <imei>
  teltonika-simulator dashboard --host <host> --port <port>

Simulator options:
  --host <host>                    Parser host
  --port <port>                    Parser port
  --imei <imei>                    Device IMEI, repeatable or comma-separated
  --interval-ms <ms>               Send interval in milliseconds
  --reconnect-delay-ms <ms>        Reconnect delay in milliseconds
  --route-file <path>              JSON route file
  --driving-style <name>           eco, normal, or aggressive
  --seed <integer>                 Deterministic simulation seed
  --device-profile <name>          Teltonika device profile name
  --dry-run                        Print packets without opening TCP
  --count, --packet-count <count>  Number of packets to emit

Dashboard options:
  dashboard                        Start the NestJS dashboard shell
  --host <host>                    HTTP bind host
  --port <port>                    HTTP bind port
  --web-host <host>                Reserved for legacy parser dashboard wiring
  --web-port <port>                Reserved for legacy parser dashboard wiring
  --accept-imei <boolean>          Reserved for legacy parser dashboard wiring

General:
  --help                           Show this help

Environment:
  TELTONIKA_HOST, TELTONIKA_PORT, TELTONIKA_IMEIS, TELTONIKA_IMEI, TELTONIKA_INTERVAL_MS,
  TELTONIKA_RECONNECT_DELAY_MS, TELTONIKA_ROUTE_FILE, TELTONIKA_DRIVING_STYLE,
  TELTONIKA_SEED, TELTONIKA_DEVICE_PROFILE, TELTONIKA_DRY_RUN,
  TELTONIKA_PACKET_COUNT, TELTONIKA_DASHBOARD_WEB_HOST,
  TELTONIKA_DASHBOARD_WEB_PORT, TELTONIKA_DASHBOARD_ACCEPT_IMEI`;

interface RawConfig {
  host?: string;
  port?: string;
  imeis: string[];
  intervalMs?: string;
  reconnectDelayMs?: string;
  routeFile?: string;
  drivingStyle?: string;
  seed?: string;
  deviceProfile?: string;
  dryRun?: string;
  packetCount?: string;
  webHost?: string;
  webPort?: string;
  acceptImei?: string;
}

export type ParseResult =
  | { kind: "simulator"; config: SimulatorConfig }
  | { kind: "dashboard"; config: DashboardConfig }
  | { kind: "help"; help: string };

export function parseConfig(argv = process.argv.slice(2), env = process.env): ParseResult {
  if (argv.includes("--help") || argv.includes("-h")) {
    return { kind: "help", help: helpText };
  }

  const mode = argv[0] === "dashboard" ? "dashboard" : "simulator";
  const args = mode === "dashboard" ? argv.slice(1) : argv;
  const raw = mergeRawConfig(readEnv(env), readArgv(args, mode));

  return mode === "dashboard" ? parseDashboardConfig(raw) : parseSimulatorConfig(raw);
}

function parseSimulatorConfig(raw: RawConfig): ParseResult {
  const host = required(raw.host, "host");
  const port = parseInteger(raw.port, "port", 1, 65535);
  const imeis = raw.imeis.flatMap(splitList).filter(Boolean);

  if (imeis.length === 0) {
    throw new Error(
      "Missing required IMEI. Provide --imei or TELTONIKA_IMEIS or TELTONIKA_IMEI.",
    );
  }

  return {
    kind: "simulator",
    config: {
      host,
      port,
      imeis,
      intervalMs: parseInteger(raw.intervalMs ?? "1000", "interval-ms", 1),
      reconnectDelayMs: parseInteger(raw.reconnectDelayMs ?? "5000", "reconnect-delay-ms", 1),
      routeFile: raw.routeFile,
      drivingStyle: parseDrivingStyleName(raw.drivingStyle ?? "normal"),
      seed: parseInteger(raw.seed ?? "1", "seed", 0),
      deviceProfile: raw.deviceProfile ?? "default-codec8e",
      dryRun: parseBoolean(raw.dryRun ?? "false", "dry-run"),
      packetCount: raw.packetCount === undefined ? undefined : parseInteger(raw.packetCount, "packet-count", 1)
    }
  };
}

function parseDashboardConfig(raw: RawConfig): ParseResult {
  return {
    kind: "dashboard",
    config: {
      host: required(raw.host, "host"),
      port: parseInteger(raw.port, "port", 1, 65535),
      webHost: raw.webHost ?? "127.0.0.1",
      webPort: parseInteger(raw.webPort ?? "3000", "web-port", 1, 65535),
      acceptImei: parseBoolean(raw.acceptImei ?? "true", "accept-imei")
    }
  };
}

function readEnv(env: NodeJS.ProcessEnv): RawConfig {
  return {
    host: env.TELTONIKA_HOST,
    port: env.TELTONIKA_PORT,
    imeis: splitList(env.TELTONIKA_IMEIS || env.TELTONIKA_IMEI),
    intervalMs: env.TELTONIKA_INTERVAL_MS,
    reconnectDelayMs: env.TELTONIKA_RECONNECT_DELAY_MS,
    routeFile: env.TELTONIKA_ROUTE_FILE,
    drivingStyle: env.TELTONIKA_DRIVING_STYLE,
    seed: env.TELTONIKA_SEED,
    deviceProfile: env.TELTONIKA_DEVICE_PROFILE,
    dryRun: env.TELTONIKA_DRY_RUN,
    packetCount: env.TELTONIKA_PACKET_COUNT,
    webHost: env.TELTONIKA_DASHBOARD_WEB_HOST,
    webPort: env.TELTONIKA_DASHBOARD_WEB_PORT,
    acceptImei: env.TELTONIKA_DASHBOARD_ACCEPT_IMEI
  };
}

function readArgv(argv: string[], mode: "simulator" | "dashboard"): Partial<RawConfig> {
  const raw: RawConfig = { imeis: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    const [flag, inlineValue] = splitInlineValue(arg);
    const value = inlineValue ?? argv[index + 1];

    switch (flag) {
      case "--host":
        raw.host = takeValue(flag, value);
        index += inlineValue === undefined ? 1 : 0;
        break;
      case "--port":
        raw.port = takeValue(flag, value);
        index += inlineValue === undefined ? 1 : 0;
        break;
      case "--imei":
        if (mode !== "simulator") {
          throw new Error(`Unknown option: ${arg}`);
        }
        raw.imeis.push(takeValue(flag, value));
        index += inlineValue === undefined ? 1 : 0;
        break;
      case "--interval-ms":
        if (mode !== "simulator") {
          throw new Error(`Unknown option: ${arg}`);
        }
        raw.intervalMs = takeValue(flag, value);
        index += inlineValue === undefined ? 1 : 0;
        break;
      case "--reconnect-delay-ms":
        if (mode !== "simulator") {
          throw new Error(`Unknown option: ${arg}`);
        }
        raw.reconnectDelayMs = takeValue(flag, value);
        index += inlineValue === undefined ? 1 : 0;
        break;
      case "--route-file":
        if (mode !== "simulator") {
          throw new Error(`Unknown option: ${arg}`);
        }
        raw.routeFile = takeValue(flag, value);
        index += inlineValue === undefined ? 1 : 0;
        break;
      case "--driving-style":
        if (mode !== "simulator") {
          throw new Error(`Unknown option: ${arg}`);
        }
        raw.drivingStyle = takeValue(flag, value);
        index += inlineValue === undefined ? 1 : 0;
        break;
      case "--seed":
        if (mode !== "simulator") {
          throw new Error(`Unknown option: ${arg}`);
        }
        raw.seed = takeValue(flag, value);
        index += inlineValue === undefined ? 1 : 0;
        break;
      case "--device-profile":
        if (mode !== "simulator") {
          throw new Error(`Unknown option: ${arg}`);
        }
        raw.deviceProfile = takeValue(flag, value);
        index += inlineValue === undefined ? 1 : 0;
        break;
      case "--dry-run":
        if (mode !== "simulator") {
          throw new Error(`Unknown option: ${arg}`);
        }
        raw.dryRun = inlineValue ?? "true";
        break;
      case "--count":
      case "--packet-count":
        if (mode !== "simulator") {
          throw new Error(`Unknown option: ${arg}`);
        }
        raw.packetCount = takeValue(flag, value);
        index += inlineValue === undefined ? 1 : 0;
        break;
      case "--web-host":
        if (mode !== "dashboard") {
          throw new Error(`Unknown option: ${arg}`);
        }
        raw.webHost = takeValue(flag, value);
        index += inlineValue === undefined ? 1 : 0;
        break;
      case "--web-port":
        if (mode !== "dashboard") {
          throw new Error(`Unknown option: ${arg}`);
        }
        raw.webPort = takeValue(flag, value);
        index += inlineValue === undefined ? 1 : 0;
        break;
      case "--accept-imei":
        if (mode !== "dashboard") {
          throw new Error(`Unknown option: ${arg}`);
        }
        raw.acceptImei = takeValue(flag, value);
        index += inlineValue === undefined ? 1 : 0;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return raw;
}

function splitInlineValue(arg: string): [string, string | undefined] {
  const separatorIndex = arg.indexOf("=");
  if (separatorIndex === -1) {
    return [arg, undefined];
  }

  return [arg.slice(0, separatorIndex), arg.slice(separatorIndex + 1)];
}

function mergeRawConfig(env: RawConfig, cli: Partial<RawConfig>): RawConfig {
  return {
    ...env,
    ...cli,
    imeis: cli.imeis && cli.imeis.length > 0 ? cli.imeis : env.imeis
  };
}

function takeValue(flag: string, value: string | undefined): string {
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}.`);
  }

  return value;
}

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing required ${name}.`);
  }

  return value;
}

function parseInteger(
  value: string | undefined,
  name: string,
  min: number,
  max = Number.MAX_SAFE_INTEGER
): number {
  if (!value || !/^-?\d+$/.test(value)) {
    throw new Error(`Invalid ${name}: expected an integer.`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Invalid ${name}: expected ${min}..${max}.`);
  }

  return parsed;
}

function parseBoolean(value: string, name: string): boolean {
  const normalized = value.toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error(`Invalid ${name}: expected boolean.`);
}

function splitList(value: string | undefined): string[] {
  return value?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
}
