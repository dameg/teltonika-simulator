export type DrivingStyle = "eco" | "normal" | "aggressive";

export interface SimulatorConfig {
  host: string;
  port: number;
  imeis: string[];
  intervalMs: number;
  reconnectDelayMs: number;
  routeFile?: string;
  drivingStyle: DrivingStyle;
  seed: number;
  deviceProfile: string;
  dryRun: boolean;
  packetCount?: number;
}

export const helpText = `Usage: teltonika-simulator --host <host> --port <port> --imei <imei>

Options:
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
  --help                           Show this help

Environment:
  TELTONIKA_HOST, TELTONIKA_PORT, TELTONIKA_IMEIS, TELTONIKA_INTERVAL_MS,
  TELTONIKA_RECONNECT_DELAY_MS, TELTONIKA_ROUTE_FILE, TELTONIKA_DRIVING_STYLE,
  TELTONIKA_SEED, TELTONIKA_DEVICE_PROFILE, TELTONIKA_DRY_RUN,
  TELTONIKA_PACKET_COUNT`;

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
}

export type ParseResult =
  | { kind: "config"; config: SimulatorConfig }
  | { kind: "help"; help: string };

export function parseConfig(argv = process.argv.slice(2), env = process.env): ParseResult {
  if (argv.includes("--help") || argv.includes("-h")) {
    return { kind: "help", help: helpText };
  }

  const raw = mergeRawConfig(readEnv(env), readArgv(argv));

  const host = required(raw.host, "host");
  const port = parseInteger(raw.port, "port", 1, 65535);
  const imeis = raw.imeis.flatMap(splitList).filter(Boolean);
  if (imeis.length === 0) {
    throw new Error("Missing required IMEI. Provide --imei or TELTONIKA_IMEIS.");
  }

  return {
    kind: "config",
    config: {
      host,
      port,
      imeis,
      intervalMs: parseInteger(raw.intervalMs ?? "1000", "interval-ms", 1),
      reconnectDelayMs: parseInteger(raw.reconnectDelayMs ?? "5000", "reconnect-delay-ms", 1),
      routeFile: raw.routeFile,
      drivingStyle: parseDrivingStyle(raw.drivingStyle ?? "normal"),
      seed: parseInteger(raw.seed ?? "1", "seed", 0),
      deviceProfile: raw.deviceProfile ?? "default-codec8e",
      dryRun: parseBoolean(raw.dryRun ?? "false", "dry-run"),
      packetCount: raw.packetCount === undefined ? undefined : parseInteger(raw.packetCount, "packet-count", 1)
    }
  };
}

function readEnv(env: NodeJS.ProcessEnv): RawConfig {
  return {
    host: env.TELTONIKA_HOST,
    port: env.TELTONIKA_PORT,
    imeis: splitList(env.TELTONIKA_IMEIS ?? env.TELTONIKA_IMEI),
    intervalMs: env.TELTONIKA_INTERVAL_MS,
    reconnectDelayMs: env.TELTONIKA_RECONNECT_DELAY_MS,
    routeFile: env.TELTONIKA_ROUTE_FILE,
    drivingStyle: env.TELTONIKA_DRIVING_STYLE,
    seed: env.TELTONIKA_SEED,
    deviceProfile: env.TELTONIKA_DEVICE_PROFILE,
    dryRun: env.TELTONIKA_DRY_RUN,
    packetCount: env.TELTONIKA_PACKET_COUNT
  };
}

function readArgv(argv: string[]): Partial<RawConfig> {
  const raw: Partial<RawConfig> = { imeis: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const [flag, inlineValue] = arg.split("=", 2);
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
        raw.imeis?.push(takeValue(flag, value));
        index += inlineValue === undefined ? 1 : 0;
        break;
      case "--interval-ms":
        raw.intervalMs = takeValue(flag, value);
        index += inlineValue === undefined ? 1 : 0;
        break;
      case "--reconnect-delay-ms":
        raw.reconnectDelayMs = takeValue(flag, value);
        index += inlineValue === undefined ? 1 : 0;
        break;
      case "--route-file":
        raw.routeFile = takeValue(flag, value);
        index += inlineValue === undefined ? 1 : 0;
        break;
      case "--driving-style":
        raw.drivingStyle = takeValue(flag, value);
        index += inlineValue === undefined ? 1 : 0;
        break;
      case "--seed":
        raw.seed = takeValue(flag, value);
        index += inlineValue === undefined ? 1 : 0;
        break;
      case "--device-profile":
        raw.deviceProfile = takeValue(flag, value);
        index += inlineValue === undefined ? 1 : 0;
        break;
      case "--dry-run":
        raw.dryRun = inlineValue ?? "true";
        break;
      case "--count":
      case "--packet-count":
        raw.packetCount = takeValue(flag, value);
        index += inlineValue === undefined ? 1 : 0;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }
  return raw;
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

function parseInteger(value: string | undefined, name: string, min: number, max = Number.MAX_SAFE_INTEGER): number {
  if (!value || !/^-?\d+$/.test(value)) {
    throw new Error(`Invalid ${name}: expected an integer.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Invalid ${name}: expected ${min}..${max}.`);
  }
  return parsed;
}

function parseDrivingStyle(value: string): DrivingStyle {
  if (value === "eco" || value === "normal" || value === "aggressive") {
    return value;
  }
  throw new Error("Invalid driving-style: expected eco, normal, or aggressive.");
}

function parseBoolean(value: string, name: string): boolean {
  if (["1", "true", "yes", "on"].includes(value.toLowerCase())) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(value.toLowerCase())) {
    return false;
  }
  throw new Error(`Invalid ${name}: expected boolean.`);
}

function splitList(value: string | undefined): string[] {
  return value?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
}
