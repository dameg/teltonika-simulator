import {
  assertUniqueImei,
  DashboardDomainError,
  normalizeImei,
  type DashboardDeviceConfig,
  type DashboardDeviceRecord,
} from "../domain";

export type CreateDashboardDeviceInput = Omit<
  DashboardDeviceRecord,
  "createdAtMs" | "imei" | "updatedAtMs"
> & {
  imei: string;
};

export interface UpdateDashboardDeviceInput
  extends Partial<
    Omit<DashboardDeviceRecord, "config" | "createdAtMs" | "imei" | "updatedAtMs">
  > {
  config?: Partial<DashboardDeviceConfig>;
}

export class InMemoryDashboardDeviceRepository {
  private readonly devices = new Map<string, DashboardDeviceRecord>();

  create(input: CreateDashboardDeviceInput): DashboardDeviceRecord {
    const imei = assertUniqueImei(input.imei, this.devices.keys());
    const record: DashboardDeviceRecord = {
      ...cloneDeviceRecord({
        ...input,
        imei,
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      }),
      imei,
    };

    this.devices.set(imei, record);
    return cloneDeviceRecord(record);
  }

  list(): DashboardDeviceRecord[] {
    return [...this.devices.values()].map(cloneDeviceRecord);
  }

  get(imei: string): DashboardDeviceRecord | undefined {
    const record = this.devices.get(normalizeImei(imei));
    return record ? cloneDeviceRecord(record) : undefined;
  }

  update(
    imei: string,
    patch: UpdateDashboardDeviceInput
  ): DashboardDeviceRecord {
    const key = normalizeImei(imei);
    const current = this.devices.get(key);

    if (!current) {
      throw new DashboardDomainError(
        "DEVICE_NOT_FOUND",
        `Device not found: ${key}`
      );
    }

    const next: DashboardDeviceRecord = {
      ...current,
      ...cloneDevicePatch(patch),
      config: {
        ...current.config,
        ...(patch.config ?? {}),
      },
      updatedAtMs: Date.now(),
    };

    this.devices.set(key, next);
    return cloneDeviceRecord(next);
  }

  delete(imei: string): boolean {
    return this.devices.delete(normalizeImei(imei));
  }

  clear(): void {
    this.devices.clear();
  }
}

function cloneDeviceRecord(record: DashboardDeviceRecord): DashboardDeviceRecord {
  return {
    ...record,
    config: {
      ...record.config,
    },
  };
}

function cloneDevicePatch(
  patch: UpdateDashboardDeviceInput
): UpdateDashboardDeviceInput {
  return {
    ...patch,
    config: patch.config
      ? {
          ...patch.config,
        }
      : undefined,
  };
}
