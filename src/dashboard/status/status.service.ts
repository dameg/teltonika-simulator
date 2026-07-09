import { Inject, Injectable } from "@nestjs/common";

import {
  type DashboardDeviceRecord,
  type DashboardRunOverview,
  type DashboardRunRecord,
  type DashboardRunStatus,
} from "../domain";
import {
  InMemoryDashboardDeviceRepository,
  InMemoryDashboardLogRepository,
  InMemoryDashboardRuntimeRepository,
} from "../repositories";

export interface DashboardDeviceStatus {
  imei: string;
  label: string;
  enabled: boolean;
  status: DashboardRunStatus;
  updatedAtMs: number;
  lastStartAtMs?: number;
  lastStopAtMs?: number;
  lastError?: string;
}

export class ActiveDashboardRunConflictError extends Error {
  constructor(readonly imeis: string[]) {
    super(`Cannot clear dashboard state while runs are active: ${imeis.join(", ")}`);
    this.name = "ActiveDashboardRunConflictError";
  }
}

@Injectable()
export class StatusService {
  constructor(
    @Inject(InMemoryDashboardDeviceRepository)
    private readonly deviceRepository: InMemoryDashboardDeviceRepository,
    @Inject(InMemoryDashboardRuntimeRepository)
    private readonly runtimeRepository: InMemoryDashboardRuntimeRepository,
    @Inject(InMemoryDashboardLogRepository)
    private readonly logRepository: InMemoryDashboardLogRepository,
  ) {}

  listDeviceStatuses(): DashboardDeviceStatus[] {
    const devices = this.deviceRepository.list();
    const runtimeByImei = new Map(
      this.runtimeRepository.list().map((record) => [record.imei, record]),
    );

    return devices.map((device) =>
      this.toDeviceStatus(device, runtimeByImei.get(device.imei)),
    );
  }

  getDeviceStatus(imei: string): DashboardDeviceStatus {
    const device = this.deviceRepository.get(imei);
    if (!device) {
      throw new Error(`Device not found: ${imei}`);
    }

    return this.toDeviceStatus(device, this.runtimeRepository.get(imei));
  }

  getOverview(): DashboardRunOverview {
    const counts: DashboardRunOverview["counts"] = {
      configured: 0,
      starting: 0,
      running: 0,
      reconnecting: 0,
      stopped: 0,
      rejected: 0,
      failed: 0,
      completed: 0,
    };

    for (const status of this.listDeviceStatuses()) {
      counts[status.status] += 1;
    }

    return {
      total: Object.values(counts).reduce((sum, count) => sum + count, 0),
      counts,
    };
  }

  clearDashboardState(): void {
    const activeImeis = this.runtimeRepository
      .list()
      .filter((record) => isActiveStatus(record.status))
      .map((record) => record.imei);

    if (activeImeis.length > 0) {
      throw new ActiveDashboardRunConflictError(activeImeis);
    }

    this.deviceRepository.clear();
    this.runtimeRepository.clear();
    this.logRepository.clear();
  }

  private toDeviceStatus(
    device: DashboardDeviceRecord,
    runtime: DashboardRunRecord | undefined,
  ): DashboardDeviceStatus {
    return {
      imei: device.imei,
      label: device.label,
      enabled: device.enabled,
      status: runtime?.status ?? "configured",
      updatedAtMs: runtime?.updatedAtMs ?? device.updatedAtMs,
      lastStartAtMs: runtime?.lastStartAtMs,
      lastStopAtMs: runtime?.lastStopAtMs,
      lastError: runtime?.lastError,
    };
  }
}

function isActiveStatus(status: DashboardRunStatus): boolean {
  return status === "starting" || status === "running" || status === "reconnecting";
}
