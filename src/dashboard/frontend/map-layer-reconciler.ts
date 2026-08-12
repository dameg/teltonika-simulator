export interface ReconciliationStats {
  added: number;
  removed: number;
  updated: number;
}

export interface LayerRegistryAdapter<TModel, TEntry> {
  key(model: TModel): string;
  create(model: TModel): TEntry;
  update(entry: TEntry, model: TModel): boolean;
  remove(entry: TEntry): void;
}

export interface PositionTelemetry {
  id?: string;
  imei: string;
  tripId: string;
  configRevision: number;
  timestampMs: number;
  latitude: number;
  longitude: number;
  altitudeMeters: number;
  headingDegrees: number;
  speedKph: number;
  satellites: number;
}

export function reconcileLayerRegistry<TModel, TEntry>(
  registry: Map<string, TEntry>,
  models: readonly TModel[],
  adapter: LayerRegistryAdapter<TModel, TEntry>,
): ReconciliationStats {
  const seen = new Set<string>();
  let added = 0;
  let removed = 0;
  let updated = 0;

  for (const model of models) {
    const key = adapter.key(model);
    seen.add(key);
    const entry = registry.get(key);
    if (entry) {
      if (adapter.update(entry, model)) updated += 1;
    } else {
      registry.set(key, adapter.create(model));
      added += 1;
    }
  }

  for (const [key, entry] of registry) {
    if (seen.has(key)) continue;
    adapter.remove(entry);
    registry.delete(key);
    removed += 1;
  }

  return { added, removed, updated };
}

export function reconcileSelectedKeys(
  previousKey: string | undefined,
  nextKey: string | undefined,
  unselect: (key: string) => void,
  select: (key: string) => void,
): void {
  if (previousKey === nextKey) return;
  if (previousKey) unselect(previousKey);
  if (nextKey) select(nextKey);
}

export function samePositionCoordinates(left: PositionTelemetry, right: PositionTelemetry): boolean {
  return left.latitude === right.latitude && left.longitude === right.longitude;
}

export function samePositionTelemetry(left: PositionTelemetry, right: PositionTelemetry): boolean {
  return left.id === right.id
    && left.imei === right.imei
    && left.tripId === right.tripId
    && left.configRevision === right.configRevision
    && left.timestampMs === right.timestampMs
    && left.latitude === right.latitude
    && left.longitude === right.longitude
    && left.altitudeMeters === right.altitudeMeters
    && left.headingDegrees === right.headingDegrees
    && left.speedKph === right.speedKph
    && left.satellites === right.satellites;
}

export function samePositionGeometry(
  left: readonly PositionTelemetry[],
  right: readonly PositionTelemetry[],
): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (!samePositionCoordinates(left[index]!, right[index]!)) return false;
  }
  return true;
}
