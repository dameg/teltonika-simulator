import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";

import { getDeviceProfile } from "../../device-profile";
import { parseDrivingStyleName } from "../../driving-style";
import {
  DashboardDomainError,
  type DashboardDeviceConfig,
  type DashboardDeviceRecord
} from "../domain";
import {
  type CreateDashboardDeviceInput,
  type UpdateDashboardDeviceInput
} from "../repositories";
import { DASHBOARD_STORE, type DashboardStore } from "../persistence/dashboard-store";
import { RuntimeConfigRegistry } from "../runtime/runtime-config-registry";

const activeStatuses = new Set(["starting", "running", "reconnecting"]);
const activeConfigFields = new Set<keyof DashboardDeviceConfig>([
  "intervalMs",
  "simulationSpeed",
  "drivingStyle",
  "seed",
  "deviceProfile",
  "packetCount",
]);

type DeviceConfigInput = {
  host: unknown;
  port: unknown;
  intervalMs: unknown;
  simulationSpeed?: unknown;
  reconnectDelayMs: unknown;
  routeFile?: unknown;
  drivingStyle: unknown;
  seed: unknown;
  deviceProfile: unknown;
  packetCount?: unknown;
};

class DeviceStateConflictError extends Error {
  constructor(
    readonly imei: string,
    readonly status: string
  ) {
    super(`Device ${imei} cannot be changed while status is ${status}`);
    this.name = "DeviceStateConflictError";
  }
}

class ActiveConfigFieldLockedError extends Error {
  constructor(
    readonly imei: string,
    readonly fields: readonly string[],
  ) {
    super(`Active device ${imei} cannot change: ${fields.join(", ")}`);
    this.name = "ActiveConfigFieldLockedError";
  }
}

@Injectable()
export class DeviceManagementService {
  constructor(
    @Inject(DASHBOARD_STORE)
    private readonly store: DashboardStore,
    @Inject(RuntimeConfigRegistry)
    private readonly runtimeConfigs: RuntimeConfigRegistry,
  ) {}

  listDevices(): Promise<DashboardDeviceRecord[]> {
    return this.store.listDevices();
  }

  async createDevice(payload: Record<string, unknown>): Promise<DashboardDeviceRecord> {
    const device = await this.store.createDevice({
      imei: this.parseRequiredString(payload.imei, "imei"),
      label: this.parseRequiredString(payload.label, "label"),
      config: this.parseDeviceConfig(payload.config)
    } satisfies CreateDashboardDeviceInput);
    await this.store.appendLog({
      id: randomUUID(),
      imei: device.imei,
      severity: "info",
      type: "deviceCreated",
      message: `Device ${device.imei} created.`,
      timestampMs: Date.now(),
    });
    return device;
  }

  async updateDevice(imei: string, payload: Record<string, unknown>): Promise<DashboardDeviceRecord> {
    const current = await this.getDeviceOrThrow(imei);
    const run = await this.store.getRun(current.imei);
    const isActive = run !== undefined && activeStatuses.has(run.status);
    const patch: UpdateDashboardDeviceInput = {};
    let changedConfigFields: Array<keyof DashboardDeviceConfig> = [];

    if (payload.label !== undefined) {
      patch.label = this.parseRequiredString(payload.label, "label");
    }
    if (payload.config !== undefined) {
      const config = this.parseDeviceConfig(payload.config);
      changedConfigFields = configKeys.filter((key) => config[key] !== current.config[key]);
      const lockedFields = changedConfigFields.filter((field) => !activeConfigFields.has(field));

      if (isActive && lockedFields.length > 0) {
        throw new ActiveConfigFieldLockedError(current.imei, lockedFields);
      }

      if (changedConfigFields.length > 0) {
        patch.config = config;
        patch.configRevision = current.configRevision + 1;
        patch.changedConfigFields = changedConfigFields;
      }
    }

    const updated = await this.store.updateDevice(current.imei, patch);
    if (isActive) this.runtimeConfigs.set(updated);
    if (changedConfigFields.length > 0) {
      if (changedConfigFields.includes("routeFile")) {
        await this.store.finishJourney(updated.imei, false);
      }
    }

    await this.store.appendLog({
      id: randomUUID(),
      imei: updated.imei,
      severity: "info",
      type: "deviceUpdated",
      message: `Device ${updated.imei} updated.`,
      timestampMs: Date.now(),
      context: { configRevision: updated.configRevision },
    });

    return updated;
  }

  async deleteDevice(imei: string): Promise<void> {
    const normalizedImei = await this.requireMutableDevice(imei);
    await this.store.appendLog({
      id: randomUUID(),
      imei: normalizedImei,
      severity: "info",
      type: "deviceDeleted",
      message: `Device ${normalizedImei} archived.`,
      timestampMs: Date.now(),
    });
    await this.store.archiveDevice(normalizedImei);
    await this.store.finishJourney(normalizedImei, false);
  }

  private async getDeviceOrThrow(imei: string): Promise<DashboardDeviceRecord> {
    const device = await this.store.getDevice(imei);
    if (!device) {
      throw new DashboardDomainError("DEVICE_NOT_FOUND", `Device not found: ${imei.trim()}`);
    }

    return device;
  }

  private async requireMutableDevice(imei: string): Promise<string> {
    const device = await this.store.getDevice(imei);
    if (!device) {
      throw new DashboardDomainError("DEVICE_NOT_FOUND", `Device not found: ${imei.trim()}`);
    }

    const run = await this.store.getRun(device.imei);
    if (run && activeStatuses.has(run.status)) {
      throw new DeviceStateConflictError(device.imei, run.status);
    }

    return device.imei;
  }

  private parseDeviceConfig(value: unknown): DashboardDeviceConfig {
    if (!isRecord(value)) {
      throw new Error("config must be an object");
    }

    const input = value as DeviceConfigInput;
    const drivingStyle = parseDrivingStyleName(
      this.parseRequiredString(input.drivingStyle, "config.drivingStyle")
    );
    const deviceProfile = this.parseRequiredString(input.deviceProfile, "config.deviceProfile");

    getDeviceProfile(deviceProfile);

    return {
      host: this.parseRequiredString(input.host, "config.host"),
      port: this.parseInteger(input.port, "config.port", 1, 65_535),
      intervalMs: this.parseInteger(input.intervalMs, "config.intervalMs", 1),
      simulationSpeed: this.parseInteger(input.simulationSpeed ?? 0, "config.simulationSpeed", -10, 10),
      reconnectDelayMs: this.parseInteger(
        input.reconnectDelayMs,
        "config.reconnectDelayMs",
        0
      ),
      routeFile: this.parseOptionalString(input.routeFile, "config.routeFile"),
      drivingStyle,
      seed: this.parseInteger(
        input.seed,
        "config.seed",
        Number.MIN_SAFE_INTEGER,
        Number.MAX_SAFE_INTEGER
      ),
      deviceProfile,
      packetCount: this.parseOptionalInteger(input.packetCount, "config.packetCount", 1)
    };
  }

  private parseRequiredString(value: unknown, field: string): string {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`${field} must be a non-empty string`);
    }

    return value.trim();
  }

  private parseOptionalString(value: unknown, field: string): string | undefined {
    if (value === undefined || value === null || value === "") {
      return undefined;
    }

    return this.parseRequiredString(value, field);
  }

  private parseInteger(
    value: unknown,
    field: string,
    min: number,
    max = Number.MAX_SAFE_INTEGER
  ): number {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
      throw new Error(`${field} must be an integer between ${min} and ${max}`);
    }

    return value;
  }

  private parseOptionalInteger(
    value: unknown,
    field: string,
    min: number
  ): number | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    return this.parseInteger(value, field, min);
  }
}

const configKeys: Array<keyof DashboardDeviceConfig> = [
  "host",
  "port",
  "intervalMs",
  "simulationSpeed",
  "reconnectDelayMs",
  "routeFile",
  "drivingStyle",
  "seed",
  "deviceProfile",
  "packetCount",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isDeviceStateConflictError(error: unknown): error is DeviceStateConflictError {
  return error instanceof DeviceStateConflictError;
}

export function isActiveConfigFieldLockedError(error: unknown): error is ActiveConfigFieldLockedError {
  return error instanceof ActiveConfigFieldLockedError;
}
