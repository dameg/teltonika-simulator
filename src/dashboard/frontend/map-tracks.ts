export interface TrackPosition {
  imei: string;
  tripId: string;
  configRevision: number;
  latitude: number;
  longitude: number;
}

export interface TrackSegment<TPosition extends TrackPosition = TrackPosition> {
  key: string;
  imei: string;
  tripId: string;
  configRevision: number;
  positions: TPosition[];
}

export interface TrackTrip<TPosition extends TrackPosition = TrackPosition> {
  key: string;
  imei: string;
  tripId: string;
  positions: TPosition[];
  segments: TrackSegment<TPosition>[];
  labelPosition: TPosition;
}

export interface GroupedTracks<TPosition extends TrackPosition = TrackPosition> {
  segments: TrackSegment<TPosition>[];
  trips: TrackTrip<TPosition>[];
  pointCount: number;
}

export type TrackGeometryVariant = "live" | "history";

export interface SampledTrackGeometry<TPosition extends TrackPosition = TrackPosition> {
  segments: readonly TrackSegment<TPosition>[];
  pointCount: number;
  requestedBudget: number;
  effectiveBudget: number;
}

export interface HistoryRecordPositionSource {
  id: string;
  timestampMs: number;
  latitude: number;
  longitude: number;
  altitudeMeters: number;
  headingDegrees: number;
  speedKph: number;
  satellites: number;
}

const GOLDEN_ANGLE_DEGREES = 137.507_764_05;

const TRACK_GEOMETRY_BUDGETS: Record<TrackGeometryVariant, readonly [number, number, number]> = {
  live: [600, 1_500, 3_000],
  history: [400, 1_000, 2_000],
};

export function trackGeometryPointBudget(variant: TrackGeometryVariant, zoom: number): number {
  if (!Number.isFinite(zoom)) throw new RangeError("map zoom must be finite");

  const budgets = TRACK_GEOMETRY_BUDGETS[variant];
  if (zoom <= 10) return budgets[0];
  if (zoom <= 13) return budgets[1];
  return budgets[2];
}

export function visibleTrackImeis(
  positions: readonly { imei: string }[],
  selectedImei: string,
): string[] {
  if (selectedImei) return [selectedImei];

  const imeis = new Set<string>();
  for (const position of positions) imeis.add(position.imei);
  return [...imeis];
}

export function groupTracks<TPosition extends TrackPosition>(
  positions: readonly TPosition[],
  selectedImei: string,
): GroupedTracks<TPosition> {
  const tripsByKey = new Map<string, TrackTrip<TPosition>>();
  const segmentsByKey = new Map<string, TrackSegment<TPosition>>();
  const previousByTrip = new Map<string, TPosition>();
  let pointCount = 0;

  for (const position of positions) {
    if (selectedImei && position.imei !== selectedImei) continue;

    pointCount += 1;
    const tripKey = `${position.imei}\u0000${position.tripId}`;
    const segmentKey = `${tripKey}\u0000${position.configRevision}`;
    let trip = tripsByKey.get(tripKey);
    if (!trip) {
      trip = {
        key: tripKey,
        imei: position.imei,
        tripId: position.tripId,
        positions: [],
        segments: [],
        labelPosition: position,
      };
      tripsByKey.set(tripKey, trip);
    }
    trip.positions.push(position);

    let segment = segmentsByKey.get(segmentKey);
    if (!segment) {
      segment = {
        key: segmentKey,
        imei: position.imei,
        tripId: position.tripId,
        configRevision: position.configRevision,
        positions: [],
      };
      const previous = previousByTrip.get(tripKey);
      if (previous && previous.configRevision !== position.configRevision) {
        segment.positions.push(previous);
      }
      segmentsByKey.set(segmentKey, segment);
      trip.segments.push(segment);
    }
    segment.positions.push(position);
    previousByTrip.set(tripKey, position);
  }

  const trips = [...tripsByKey.values()];
  for (const trip of trips) {
    trip.labelPosition = trip.positions[Math.floor((trip.positions.length - 1) / 2)]!;
  }

  return { segments: [...segmentsByKey.values()], trips, pointCount };
}

export function sampleTrackPositions<TPosition>(
  positions: readonly TPosition[],
  maximum: number,
): readonly TPosition[] {
  if (!Number.isInteger(maximum) || maximum < 2) {
    throw new RangeError("maximum track points must be an integer of at least 2");
  }
  if (positions.length <= maximum) return positions;

  const sampled: TPosition[] = [positions[0]!];
  const step = (positions.length - 1) / (maximum - 1);
  for (let index = 1; index < maximum - 1; index += 1) {
    sampled.push(positions[Math.round(index * step)]!);
  }
  sampled.push(positions[positions.length - 1]!);
  return sampled;
}

export function sampleTrackSegmentsWithinBudget<TPosition extends TrackPosition>(
  segments: readonly TrackSegment<TPosition>[],
  maximum: number,
  isRequired: (position: TPosition) => boolean = () => false,
): SampledTrackGeometry<TPosition> {
  if (!Number.isInteger(maximum) || maximum < 1) {
    throw new RangeError("maximum track geometry points must be a positive integer");
  }

  const requiredIndexes = segments.map((segment) => {
    const indexes = new Set<number>();
    if (segment.positions.length > 0) {
      indexes.add(0);
      indexes.add(segment.positions.length - 1);
    }
    for (let index = 1; index < segment.positions.length - 1; index += 1) {
      if (isRequired(segment.positions[index]!)) indexes.add(index);
    }
    return indexes;
  });

  const requiredCount = requiredIndexes.reduce((count, indexes) => count + indexes.size, 0);
  const effectiveBudget = Math.max(maximum, requiredCount);
  const optionalIndexesBySegment = segments.map((segment, segmentIndex) => (
    segment.positions
      .map((_, positionIndex) => positionIndex)
      .filter((positionIndex) => !requiredIndexes[segmentIndex]!.has(positionIndex))
  ));
  const optionalCount = optionalIndexesBySegment.reduce(
    (count, indexes) => count + indexes.length,
    0,
  );
  const optionalSlots = Math.min(optionalCount, effectiveBudget - requiredCount);
  const optionalSlotsBySegment = distributeSlotsByWaterFilling(
    optionalIndexesBySegment.map((indexes) => indexes.length),
    optionalSlots,
  );

  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
    const optionalIndexes = optionalIndexesBySegment[segmentIndex]!;
    const chosenOptionalIndexes = evenlySpacedIndexes(
      optionalIndexes.length,
      optionalSlotsBySegment[segmentIndex]!,
    );
    for (const optionalIndex of chosenOptionalIndexes) {
      requiredIndexes[segmentIndex]!.add(optionalIndexes[optionalIndex]!);
    }
  }

  let pointCount = 0;
  let changed = false;
  const sampledSegments = segments.map((segment, segmentIndex) => {
    const indexes = requiredIndexes[segmentIndex]!;
    pointCount += indexes.size;
    if (indexes.size === segment.positions.length) return segment;

    changed = true;
    return {
      ...segment,
      positions: [...indexes]
        .sort((left, right) => left - right)
        .map((index) => segment.positions[index]!),
    };
  });

  return {
    segments: changed ? sampledSegments : segments,
    pointCount,
    requestedBudget: maximum,
    effectiveBudget,
  };
}

function distributeSlotsByWaterFilling(capacities: readonly number[], maximum: number): number[] {
  const allocations = capacities.map(() => 0);
  let remaining = maximum;

  while (remaining > 0) {
    let allocatedThisRound = 0;
    for (let index = 0; index < capacities.length && remaining > 0; index += 1) {
      if (allocations[index]! >= capacities[index]!) continue;
      allocations[index] += 1;
      remaining -= 1;
      allocatedThisRound += 1;
    }
    if (allocatedThisRound === 0) break;
  }

  return allocations;
}

function evenlySpacedIndexes(length: number, maximum: number): number[] {
  if (maximum === 0) return [];
  if (maximum >= length) return Array.from({ length }, (_, index) => index);
  if (maximum === 1) return [Math.floor((length - 1) / 2)];

  const indexes: number[] = [];
  const step = (length - 1) / (maximum - 1);
  for (let index = 0; index < maximum; index += 1) {
    indexes.push(Math.round(index * step));
  }
  return indexes;
}

export function historyRecordsToTrackPositions<TRecord extends HistoryRecordPositionSource>(
  records: readonly TRecord[],
  imei: string,
  tripId: string,
): Array<TRecord & TrackPosition> {
  return records.map((record) => ({
    ...record,
    imei,
    tripId,
    configRevision: 1,
  }));
}

export function colorForRevision(imei: string, configRevision: number): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < imei.length; index += 1) {
    hash = Math.imul(hash ^ imei.charCodeAt(index), 16_777_619);
  }
  const deviceBaseHue = (hash >>> 0) % 360;
  const revisionOffset = Math.max(0, configRevision - 1) * GOLDEN_ANGLE_DEGREES;
  const hue = (deviceBaseHue + revisionOffset) % 360;
  return `hsl(${hue.toFixed(6)}, 68%, 42%)`;
}
