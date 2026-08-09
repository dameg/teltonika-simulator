import { normalizeImei } from "../domain";

export interface DashboardJourneyState<TCheckpoint = unknown> {
  imei: string;
  tripId: string;
  routeFile?: string;
  acceptedRecordCount: number;
  completed: boolean;
  checkpoint?: TCheckpoint;
}

export class InMemoryDashboardJourneyRepository {
  private readonly journeys = new Map<string, DashboardJourneyState>();

  get<TCheckpoint = unknown>(imei: string): DashboardJourneyState<TCheckpoint> | undefined {
    const state = this.journeys.get(normalizeImei(imei));
    return state ? cloneJourney(state) as DashboardJourneyState<TCheckpoint> : undefined;
  }

  set<TCheckpoint = unknown>(state: DashboardJourneyState<TCheckpoint>): DashboardJourneyState<TCheckpoint> {
    const next: DashboardJourneyState<TCheckpoint> = {
      ...state,
      imei: normalizeImei(state.imei),
      checkpoint: cloneValue(state.checkpoint),
    };
    this.journeys.set(next.imei, next);
    return cloneJourney(next);
  }

  update<TCheckpoint = unknown>(
    imei: string,
    patch: Partial<Omit<DashboardJourneyState<TCheckpoint>, "imei">>,
  ): DashboardJourneyState<TCheckpoint> {
    const key = normalizeImei(imei);
    const current = this.journeys.get(key);
    if (!current) {
      throw new Error(`Journey not found: ${key}`);
    }

    return this.set({ ...current, ...patch, imei: key } as DashboardJourneyState<TCheckpoint>);
  }

  delete(imei: string): boolean {
    return this.journeys.delete(normalizeImei(imei));
  }

  clear(): void {
    this.journeys.clear();
  }
}

function cloneJourney<TCheckpoint>(state: DashboardJourneyState<TCheckpoint>): DashboardJourneyState<TCheckpoint> {
  return {
    ...state,
    checkpoint: cloneValue(state.checkpoint),
  };
}

function cloneValue<T>(value: T): T {
  return value === undefined ? value : structuredClone(value);
}
