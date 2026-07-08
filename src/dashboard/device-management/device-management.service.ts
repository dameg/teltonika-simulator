import { Inject, Injectable } from "@nestjs/common";

import { getDeviceProfile } from "../../device-profile";
import { parseDrivingStyleName } from "../../driving-style";
import {
  assertUniqueImei,
  DashboardDomainError,
  type DashboardDeviceConfig,
  type DashboardDeviceRecord,
  findDuplicateImeis
} from "../domain";
import {
  InMemoryDashboardDeviceRepository,
  InMemoryDashboardLogRepository,
  InMemoryDashboardRuntimeRepository,
  type CreateDashboardDeviceInput,
  type UpdateDashboardDeviceInput
} from "../repositories";

const importStatuses = new Set(["starting", "running", "reconnecting"]);

const defaultImportedConfig: DashboardDeviceConfig = {
  host: "127.0.0.1",
  port: 5027,
  intervalMs: 1000,
  reconnectDelayMs: 3000,
  routeFile: undefined,
  drivingStyle: "normal",
  seed: 1,
  deviceProfile: "default-codec8e",
  packetCount: undefined
};

type DeviceConfigInput = {
  host: unknown;
  port: unknown;
  intervalMs: unknown;
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

@Injectable()
export class DeviceManagementService {
  constructor(
    @Inject(InMemoryDashboardDeviceRepository)
    private readonly deviceRepository: InMemoryDashboardDeviceRepository,
    @Inject(InMemoryDashboardRuntimeRepository)
    private readonly runtimeRepository: InMemoryDashboardRuntimeRepository,
    @Inject(InMemoryDashboardLogRepository)
    private readonly logRepository: InMemoryDashboardLogRepository
  ) {}

  listDevices(): DashboardDeviceRecord[] {
    return this.deviceRepository.list();
  }

  createDevice(payload: Record<string, unknown>): DashboardDeviceRecord {
    const device = this.deviceRepository.create({
      imei: this.parseRequiredString(payload.imei, "imei"),
      label: this.parseRequiredString(payload.label, "label"),
      enabled: this.parseBoolean(payload.enabled, "enabled", true),
      config: this.parseDeviceConfig(payload.config)
    } satisfies CreateDashboardDeviceInput);

    return device;
  }

  updateDevice(imei: string, payload: Record<string, unknown>): DashboardDeviceRecord {
    const normalizedImei = this.requireMutableDevice(imei);
    const patch: UpdateDashboardDeviceInput = {};

    if (payload.label !== undefined) {
      patch.label = this.parseRequiredString(payload.label, "label");
    }
    if (payload.enabled !== undefined) {
      patch.enabled = this.parseBoolean(payload.enabled, "enabled");
    }
    if (payload.config !== undefined) {
      patch.config = this.parseDeviceConfig(payload.config);
    }

    return this.deviceRepository.update(normalizedImei, patch);
  }

  deleteDevice(imei: string): void {
    const normalizedImei = this.requireMutableDevice(imei);
    this.deviceRepository.delete(normalizedImei);
    this.logRepository.clearByDevice(normalizedImei);
    this.runtimeRepository.delete(normalizedImei);
  }

  bulkImport(payload: Record<string, unknown>): DashboardDeviceRecord[] {
    const imeis = this.parseImportImeis(payload.imeis);
    const duplicateImeis = findDuplicateImeis(imeis);

    if (duplicateImeis.length > 0) {
      throw new DashboardDomainError(
        "DUPLICATE_IMEI",
        `Duplicate IMEIs in import payload: ${duplicateImeis.join(", ")}`
      );
    }

    const seenImeis = this.deviceRepository.list().map((device) => device.imei);

    return imeis.map((imei, index) => {
      assertUniqueImei(imei, seenImeis);
      seenImeis.push(imei);

      return this.deviceRepository.create({
        imei,
        label: `Imported Device ${index + 1}`,
        enabled: true,
        config: { ...defaultImportedConfig }
      } satisfies CreateDashboardDeviceInput);
    });
  }

  private requireMutableDevice(imei: string): string {
    const device = this.deviceRepository.get(imei);
    if (!device) {
      throw new DashboardDomainError("DEVICE_NOT_FOUND", `Device not found: ${imei.trim()}`);
    }

    const run = this.runtimeRepository.get(device.imei);
    if (run && importStatuses.has(run.status)) {
      throw new DeviceStateConflictError(device.imei, run.status);
    }

    return device.imei;
  }

  private parseImportImeis(value: unknown): string[] {
    const raw = this.parseRequiredString(value, "imeis");
    const imeis = raw
      .replace(/,\s*\n/gu, "\n")
      .replace(/\n\s*,/gu, "\n")
      .split(/\n/u)
      .flatMap((line) => {
        const trimmedLine = line.trim();
        return trimmedLine.length === 0 ? [] : trimmedLine.split(",");
      })
      .map((entry) => entry.trim());

    if (imeis.length === 0) {
      throw new DashboardDomainError("EMPTY_IMEI", "At least one IMEI is required for import");
    }

    return imeis;
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

  private parseBoolean(value: unknown, field: string, defaultValue?: boolean): boolean {
    if (value === undefined) {
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      throw new Error(`${field} must be a boolean`);
    }

    if (typeof value !== "boolean") {
      throw new Error(`${field} must be a boolean`);
    }

    return value;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isDeviceStateConflictError(error: unknown): error is DeviceStateConflictError {
  return error instanceof DeviceStateConflictError;
}
