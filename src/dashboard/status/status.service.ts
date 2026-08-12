import { BadRequestException, Inject, Injectable } from "@nestjs/common";

import {
  type DashboardDeviceRecord,
  type DashboardRunOverview,
  type DashboardRunRecord,
  type DashboardRunStatus,
} from "../domain";
import { DASHBOARD_STORE, type DashboardStore } from "../persistence/dashboard-store";

export interface PositionPageQueryInput {
  afterRecordId?: string;
  limit?: string;
}

export interface DashboardDeviceStatus {
  imei: string;
  label: string;
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
    @Inject(DASHBOARD_STORE)
    private readonly store: DashboardStore,
  ) {}

  async listDeviceStatuses(): Promise<DashboardDeviceStatus[]> {
    const devices = await this.store.listDevices();
    const runtimeByImei = new Map(
      (await this.store.listRuns()).map((record) => [record.imei, record]),
    );

    return devices.map((device) =>
      this.toDeviceStatus(device, runtimeByImei.get(device.imei)),
    );
  }

  async getDeviceStatus(imei: string): Promise<DashboardDeviceStatus> {
    const device = await this.store.getDevice(imei);
    if (!device) {
      throw new Error(`Device not found: ${imei}`);
    }

    return this.toDeviceStatus(device, await this.store.getRun(imei));
  }

  async getOverview(): Promise<DashboardRunOverview> {
    const counts: DashboardRunOverview["counts"] = {
      configured: 0,
      starting: 0,
      running: 0,
      reconnecting: 0,
      stopped: 0,
      rejected: 0,
      failed: 0,
      interrupted: 0,
      completed: 0,
    };

    for (const status of await this.listDeviceStatuses()) {
      counts[status.status] += 1;
    }

    return {
      total: Object.values(counts).reduce((sum, count) => sum + count, 0),
      counts,
    };
  }

  async listPositions(imei?: string, input: PositionPageQueryInput = {}) {
    const query = parsePositionPageQuery(input);
    const page = await this.store.listPositions({ imei, ...query });
    return {
      positions: page.positions,
      configRevisions: await this.store.listConfigRevisionsForPositions(page.positions),
      nextRecordId: page.positions.at(-1)?.id ?? query.afterRecordId ?? "0",
      hasMore: page.hasMore,
    };
  }

  async clearDashboardState(): Promise<void> {
    const activeImeis = (await this.store
      .listRuns())
      .filter((record) => isActiveStatus(record.status))
      .map((record) => record.imei);

    if (activeImeis.length > 0) {
      throw new ActiveDashboardRunConflictError(activeImeis);
    }

    await this.store.archiveDashboardState();
  }

  private toDeviceStatus(
    device: DashboardDeviceRecord,
    runtime: DashboardRunRecord | undefined,
  ): DashboardDeviceStatus {
    return {
      imei: device.imei,
      label: device.label,
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

function parsePositionPageQuery(input: PositionPageQueryInput): {
  afterRecordId?: string;
  limit: number;
} {
  const { afterRecordId } = input;
  if (afterRecordId !== undefined && !isRecordId(afterRecordId)) {
    throw new BadRequestException({
      error: {
        code: "INVALID_RECORD_ID",
        message: "afterRecordId must be a non-negative integer.",
      },
    });
  }

  const maximumLimit = afterRecordId === undefined ? 5_000 : 1_000;
  const limit = input.limit === undefined ? maximumLimit : parseLimit(input.limit, maximumLimit);
  return { afterRecordId, limit };
}

function isRecordId(value: string): boolean {
  if (!/^\d+$/.test(value)) return false;
  try {
    return BigInt(value) <= 9_223_372_036_854_775_807n;
  } catch {
    return false;
  }
}

function parseLimit(value: string, maximum: number): number {
  if (!/^[1-9]\d*$/.test(value)) {
    throw invalidLimit(maximum);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) {
    throw invalidLimit(maximum);
  }
  return parsed;
}

function invalidLimit(maximum: number): BadRequestException {
  return new BadRequestException({
    error: {
      code: "INVALID_LIMIT",
      message: `Limit must be between 1 and ${maximum}.`,
    },
  });
}
