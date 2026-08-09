import {
  normalizeImei,
  type DashboardConfigRevision,
  type DashboardDeviceConfig,
} from "../domain";

export interface AppendDashboardConfigRevisionInput {
  imei: string;
  configRevision: number;
  createdAtMs?: number;
  changedFields: readonly string[];
  config: DashboardDeviceConfig;
}

export class InMemoryDashboardConfigRevisionRepository {
  private readonly revisions = new Map<string, DashboardConfigRevision[]>();

  append(input: AppendDashboardConfigRevisionInput): DashboardConfigRevision {
    const imei = normalizeImei(input.imei);
    const revisions = this.revisions.get(imei) ?? [];
    const revision: DashboardConfigRevision = {
      imei,
      configRevision: input.configRevision,
      createdAtMs: input.createdAtMs ?? Date.now(),
      changedFields: [...input.changedFields],
      config: { ...input.config },
    };

    revisions.push(revision);
    this.revisions.set(imei, revisions);
    return cloneConfigRevision(revision);
  }

  list(imei?: string): DashboardConfigRevision[] {
    const revisions = imei
      ? this.revisions.get(normalizeImei(imei)) ?? []
      : [...this.revisions.values()].flat();

    return revisions.map(cloneConfigRevision);
  }

  listReferenced(positions: readonly { imei: string; configRevision: number }[]): DashboardConfigRevision[] {
    const referenced = new Set(
      positions.map((position) => `${normalizeImei(position.imei)}:${position.configRevision}`),
    );

    return this.list().filter((revision) =>
      referenced.has(`${revision.imei}:${revision.configRevision}`),
    );
  }

  clearByDevice(imei: string): void {
    this.revisions.delete(normalizeImei(imei));
  }

  clear(): void {
    this.revisions.clear();
  }
}

function cloneConfigRevision(revision: DashboardConfigRevision): DashboardConfigRevision {
  return {
    ...revision,
    changedFields: [...revision.changedFields],
    config: { ...revision.config },
  };
}
