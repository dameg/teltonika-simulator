import {
  DashboardDomainError,
  normalizeImei,
  type DashboardRunOverview,
  type DashboardRunRecord,
  type DashboardRunStatus,
} from "../domain";

export class InMemoryDashboardRuntimeRepository {
  private readonly runs = new Map<string, DashboardRunRecord>();

  set(record: DashboardRunRecord): DashboardRunRecord {
    const key = normalizeImei(record.imei);
    const next = cloneRunRecord({
      ...record,
      imei: key,
    });

    this.runs.set(key, next);
    return cloneRunRecord(next);
  }

  get(imei: string): DashboardRunRecord | undefined {
    const record = this.runs.get(normalizeImei(imei));
    return record ? cloneRunRecord(record) : undefined;
  }

  list(): DashboardRunRecord[] {
    return [...this.runs.values()].map(cloneRunRecord);
  }

  listByStatus(status: DashboardRunStatus): DashboardRunRecord[] {
    return this.list().filter((record) => record.status === status);
  }

  update(
    imei: string,
    patch: Partial<Omit<DashboardRunRecord, "imei">>
  ): DashboardRunRecord {
    const key = normalizeImei(imei);
    const current = this.runs.get(key);

    if (!current) {
      throw new DashboardDomainError("RUN_NOT_FOUND", `Run not found: ${key}`);
    }

    const next = cloneRunRecord({
      ...current,
      ...patch,
      imei: key,
    });

    this.runs.set(key, next);
    return cloneRunRecord(next);
  }

  delete(imei: string): boolean {
    return this.runs.delete(normalizeImei(imei));
  }

  clear(): void {
    this.runs.clear();
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

    for (const record of this.runs.values()) {
      counts[record.status] += 1;
    }

    return {
      total: this.runs.size,
      counts,
    };
  }
}

function cloneRunRecord(record: DashboardRunRecord): DashboardRunRecord {
  return {
    ...record,
  };
}
