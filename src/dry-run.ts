import type { SimulatorConfig } from "./config";
import { mapVehicleStateToAvlRecord } from "./avl-mapping";
import { encodeCodec8ExtendedPacket } from "./codec8-extended";
import { getDeviceProfile } from "./device-profile";
import { resolveSimulationRoute } from "./route";
import { createVehicleSimulator } from "./simulation";

export const dryRunStartTimestampMs = 1_700_000_000_000;

export interface DryRunOutput {
  stdoutLines: string[];
  stderrLines: string[];
}

export function createDryRunOutput(config: SimulatorConfig): DryRunOutput {
  const route = resolveSimulationRoute(config.routeFile);
  const profile = getDeviceProfile(config.deviceProfile);
  const packetCount = config.packetCount ?? 1;
  const stdoutLines: string[] = [];
  const stderrLines = [`dry-run route=${route.metadata.id} style=${config.drivingStyle} count=${packetCount}`];

  for (const imei of config.imeis) {
    const simulator = createVehicleSimulator({
      route,
      drivingStyle: config.drivingStyle,
      seed: config.seed,
      startTimestampMs: dryRunStartTimestampMs,
      intervalMs: config.intervalMs,
      externalVoltageMv: profile.defaults.externalVoltageMv,
      batteryVoltageMv: profile.defaults.batteryVoltageMv
    });

    stderrLines.push(`dry-run imei=${imei} packets=${packetCount}`);
    for (let index = 0; index < packetCount; index += 1) {
      const record = mapVehicleStateToAvlRecord(simulator.next(), profile);
      stdoutLines.push(encodeCodec8ExtendedPacket([record]).toString("hex"));
    }
  }

  return { stdoutLines, stderrLines };
}
