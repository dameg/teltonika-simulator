import { normalizeImei, type DashboardLogEvent } from "../domain";

export interface DashboardLogQuery {
  imei?: string;
  severity?: DashboardLogEvent["severity"];
  type?: DashboardLogEvent["type"];
  limit?: number;
}

export class InMemoryDashboardLogRepository {
  private readonly events: DashboardLogEvent[] = [];

  append(event: DashboardLogEvent): DashboardLogEvent {
    const next = cloneLogEvent({
      ...event,
      imei: event.imei ? normalizeImei(event.imei) : undefined,
    });

    this.events.push(next);
    return cloneLogEvent(next);
  }

  list(query: DashboardLogQuery = {}): DashboardLogEvent[] {
    const filtered = this.events.filter((event) => {
      if (query.imei && event.imei !== normalizeImei(query.imei)) {
        return false;
      }

      if (query.severity && event.severity !== query.severity) {
        return false;
      }

      if (query.type && event.type !== query.type) {
        return false;
      }

      return true;
    });

    const limited =
      query.limit === undefined ? filtered : filtered.slice(-query.limit);

    return limited.map(cloneLogEvent);
  }

  clear(): void {
    this.events.length = 0;
  }

  clearByDevice(imei: string): void {
    const key = normalizeImei(imei);
    const kept = this.events.filter((event) => event.imei !== key);

    this.events.length = 0;
    this.events.push(...kept);
  }
}

function cloneLogEvent(event: DashboardLogEvent): DashboardLogEvent {
  return {
    ...event,
    context: event.context
      ? {
          ...event.context,
        }
      : undefined,
    data: event.data === undefined ? undefined : structuredClone(event.data),
  };
}
