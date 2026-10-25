import { parseConfig } from "./config";
import { createDryRunOutput } from "./dry-run";
import { runMultiDeviceRuntime } from "./multi-device-runtime";

export interface CliIo {
  stdout: Pick<NodeJS.WriteStream, "write">;
  stderr: Pick<NodeJS.WriteStream, "write">;
}

export async function runCli(
  argv = process.argv.slice(2),
  env = process.env,
  io: CliIo = process,
): Promise<number> {
  const result = parseConfig(argv, env);
  if (result.kind === "help") {
    io.stdout.write(`${result.help}\n`);
    return 0;
  }

  if (result.config.dryRun) {
    const output = createDryRunOutput(result.config);
    if (output.stderrLines.length > 0) {
      io.stderr.write(`${output.stderrLines.join("\n")}\n`);
    }
    if (output.stdoutLines.length > 0) {
      io.stdout.write(`${output.stdoutLines.join("\n")}\n`);
    }
    return 0;
  }

  const controller = new AbortController();
  const cleanupProcessHooks = registerTerminationHooks(controller);

  try {
    await runMultiDeviceRuntime({
      host: result.config.host,
      port: result.config.port,
      imeis: result.config.imeis,
      intervalMs: result.config.intervalMs,
      reconnectDelayMs: result.config.reconnectDelayMs,
      routeFile: result.config.routeFile,
      drivingStyle: result.config.drivingStyle,
      seed: result.config.seed,
      deviceProfile: result.config.deviceProfile,
      signal: controller.signal,
      logger: {
        info(message) {
          io.stderr.write(`${message}\n`);
        },
        error(message) {
          io.stderr.write(`${message}\n`);
        },
      },
    });
  } finally {
    cleanupProcessHooks();
  }

  return 0;
}

function registerTerminationHooks(controller: AbortController): () => void {
  const abort = () => {
    controller.abort();
  };

  process.once("SIGINT", abort);
  process.once("SIGTERM", abort);

  return () => {
    process.off("SIGINT", abort);
    process.off("SIGTERM", abort);
  };
}
