import type { MapConfigRevision, MapPosition } from "./DeviceMap";

export const MAX_LIVE_POSITIONS = 5_000;

export interface LivePositionsPage {
  positions: MapPosition[];
  configRevisions: MapConfigRevision[];
  nextRecordId: string;
  hasMore: boolean;
}

export function mergeLivePositions(
  current: readonly MapPosition[],
  incoming: readonly MapPosition[],
  maximum = MAX_LIVE_POSITIONS,
): MapPosition[] {
  if (!Number.isSafeInteger(maximum) || maximum < 1) {
    throw new RangeError("maximum live positions must be a positive safe integer");
  }
  if (incoming.length === 0) return current as MapPosition[];

  const positions = new Map<string, MapPosition>();
  for (const position of current) positions.set(positionKey(position), position);
  for (const position of incoming) positions.set(positionKey(position), position);

  const merged = [...positions.values()].sort(comparePositions);
  return merged.length <= maximum ? merged : merged.slice(merged.length - maximum);
}

export function mergeConfigRevisions(
  current: readonly MapConfigRevision[],
  incoming: readonly MapConfigRevision[],
): MapConfigRevision[] {
  if (incoming.length === 0) return current as MapConfigRevision[];
  const revisions = new Map(current.map((revision) => [revisionKey(revision), revision]));
  for (const revision of incoming) revisions.set(revisionKey(revision), revision);
  return [...revisions.values()].sort((left, right) =>
    left.createdAtMs - right.createdAtMs
    || left.imei.localeCompare(right.imei)
    || left.configRevision - right.configRevision
  );
}

function positionKey(position: MapPosition): string {
  return position.id ?? [
    position.imei,
    position.tripId,
    position.timestampMs,
    position.latitude,
    position.longitude,
  ].join("\u0000");
}

function comparePositions(left: MapPosition, right: MapPosition): number {
  if (left.id !== undefined && right.id !== undefined && /^\d+$/.test(left.id) && /^\d+$/.test(right.id)) {
    const lengthDifference = left.id.length - right.id.length;
    return lengthDifference || left.id.localeCompare(right.id);
  }
  return left.timestampMs - right.timestampMs || positionKey(left).localeCompare(positionKey(right));
}

function revisionKey(revision: MapConfigRevision): string {
  return `${revision.imei}\u0000${revision.configRevision}`;
}
