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
