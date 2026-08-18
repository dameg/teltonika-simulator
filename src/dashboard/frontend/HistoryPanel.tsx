import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Code,
  Group,
  Paper,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { RefreshCw, X } from "lucide-react";
import { memo, useCallback, useMemo, useRef, useState, type ReactElement } from "react";

import { request } from "./dashboard-api";
import { DeviceMap, type MapConfigRevision, type MapPosition } from "./DeviceMap";
import { historyRecordsToTrackPositions } from "./map-tracks";
import { TelemetrySummary, type TelemetrySnapshot } from "./TelemetrySummary";

export interface HistoryDevice {
  imei: string;
  label: string;
  source: string;
  archived: boolean;
}

interface HistoryTrip {
  id: string;
  status: string;
  acceptedRecordCount: number;
  recordCount: number;
  startedAtMs: number;
  finishedAtMs?: number;
}

interface HistoryRecord {
  id: string;
  frameId: string;
  tripId: string | null;
  timestampMs: number;
  latitude: number;
  longitude: number;
  altitudeMeters: number;
  headingDegrees: number;
  speedKph: number;
  satellites: number;
  telemetry: TelemetrySnapshot;
}

interface HistoryPage<TItem> {
  items: TItem[];
  nextCursor?: string;
}

interface HistoryPanelProps {
  devices: HistoryDevice[];
  onError: (message: string) => void;
}

const HISTORY_PAGE_SIZE = 500;
const MAX_HISTORY_ROUTE_POINTS = 2_000;
const emptyConfigRevisions: MapConfigRevision[] = [];

export const HistoryPanel = memo(function HistoryPanel({ devices, onError }: HistoryPanelProps): ReactElement {
  const [imei, setImei] = useState("");
  const [trips, setTrips] = useState<HistoryTrip[]>([]);
  const [selectedTripId, setSelectedTripId] = useState("");
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [selectedRecordId, setSelectedRecordId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [tripsTruncated, setTripsTruncated] = useState(false);
  const [routeTruncated, setRouteTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const tripsRequest = useRef(0);
  const routeRequest = useRef(0);

  const loadRoute = useCallback(async (tripId: string, rangeFrom: string, rangeTo: string) => {
    const requestId = ++routeRequest.current;
    if (!tripId) {
      setRecords([]);
      setSelectedRecordId("");
      setRouteTruncated(false);
      return;
    }
    if (!validHistoryRange(rangeFrom, rangeTo)) {
      onError("History start time must not be later than its end time.");
      return;
    }

    setLoading(true);
    try {
      const result = await requestHistoryRoute(tripId, rangeFrom, rangeTo);
      if (routeRequest.current !== requestId) return;
      setRecords(result.records);
      setRouteTruncated(result.truncated);
      setSelectedRecordId("");
    } catch (error) {
      if (routeRequest.current === requestId) {
        onError(error instanceof Error ? error.message : "Trip history refresh failed");
      }
    } finally {
      if (routeRequest.current === requestId) setLoading(false);
    }
  }, [onError]);

  const loadTrips = useCallback(async (nextImei: string, rangeFrom: string, rangeTo: string) => {
    const requestId = ++tripsRequest.current;
    routeRequest.current += 1;
    if (!nextImei) {
      setTrips([]);
      setSelectedTripId("");
      setRecords([]);
      return;
    }
    if (!validHistoryRange(rangeFrom, rangeTo)) {
      onError("History start time must not be later than its end time.");
      return;
    }

    setLoading(true);
    try {
      const page = await request<HistoryPage<HistoryTrip>>(
        `/api/history/devices/${encodeURIComponent(nextImei)}/trips?${historyQuery(rangeFrom, rangeTo, 100)}`,
      );
      if (tripsRequest.current !== requestId) return;
      setTrips(page.items);
      setTripsTruncated(Boolean(page.nextCursor));
      const nextTripId = page.items[0]?.id ?? "";
      setSelectedTripId(nextTripId);
      if (nextTripId) await loadRoute(nextTripId, rangeFrom, rangeTo);
      else {
        setRecords([]);
        setSelectedRecordId("");
        setRouteTruncated(false);
      }
    } catch (error) {
      if (tripsRequest.current === requestId) {
        onError(error instanceof Error ? error.message : "Trip list refresh failed");
      }
    } finally {
      if (tripsRequest.current === requestId) setLoading(false);
    }
  }, [loadRoute, onError]);

  const selectedTrip = trips.find((trip) => trip.id === selectedTripId);
  const selectedRecord = records.find((record) => record.id === selectedRecordId);
  const positions = useMemo(
    () => historyRecordsToTrackPositions(records, imei, selectedTripId),
    [imei, records, selectedTripId],
  );
  const mapDevices = useMemo(() => {
    if (!imei) return [];
    const device = devices.find((candidate) => candidate.imei === imei);
    return [{ imei, label: device?.label ?? imei, status: "stored" }];
  }, [devices, imei]);
  const deviceOptions = useMemo(() => devices.map((device) => ({
    value: device.imei,
    label: `${device.label} · ${device.imei}${device.archived ? " · archived" : ""}`,
  })), [devices]);
  const tripOptions = useMemo(() => trips.map((trip) => ({
    value: trip.id,
    label: `${new Date(trip.startedAtMs).toLocaleString()} · ${trip.recordCount} points · ${trip.status}`,
  })), [trips]);

  const selectDevice = useCallback((value: string | null) => {
    const nextImei = value ?? "";
    setImei(nextImei);
    setTrips([]);
    setSelectedTripId("");
    setRecords([]);
    setSelectedRecordId("");
    void loadTrips(nextImei, from, to);
  }, [from, loadTrips, to]);

  const selectTrip = useCallback((value: string | null) => {
    const nextTripId = value ?? "";
    setSelectedTripId(nextTripId);
    setRecords([]);
    setSelectedRecordId("");
    void loadRoute(nextTripId, from, to);
  }, [from, loadRoute, to]);

  const selectPosition = useCallback((position: MapPosition) => {
    if (position.id) setSelectedRecordId(position.id);
  }, []);

  return (
    <Paper withBorder className="surface history-surface">
      <Group justify="space-between" align="flex-start" className="surface-heading">
        <Box>
          <Title order={2}>Trip history</Title>
          <Text size="xs" c="dimmed">Stored routes and telemetry · loaded on demand</Text>
        </Box>
        <Group gap="xs">
          {tripsTruncated ? <Badge variant="light" color="yellow">Newest 100 trips</Badge> : null}
          {routeTruncated ? <Badge variant="light" color="yellow">First {MAX_HISTORY_ROUTE_POINTS} points</Badge> : null}
        </Group>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 5 }} className="history-filters">
        <Select label="Device" placeholder="Select a device" searchable clearable value={imei || null} data={deviceOptions} onChange={selectDevice} />
        <Select label="Trip" placeholder={imei ? "Select a trip" : "Select a device first"} searchable clearable disabled={!imei || trips.length === 0} value={selectedTripId || null} data={tripOptions} onChange={selectTrip} />
        <TextInput label="From" type="datetime-local" value={from} onChange={(event) => setFrom(event.target.value)} />
        <TextInput label="To" type="datetime-local" value={to} onChange={(event) => setTo(event.target.value)} />
        <Button className="history-load-button" variant="default" loading={loading} disabled={!imei} leftSection={<RefreshCw size={14} />} onClick={() => void loadTrips(imei, from, to)}>Load history</Button>
      </SimpleGrid>

      <div className="history-grid">
        <div className="history-map-panel">
          <Group justify="space-between" mb="xs">
            <Text fw={650} size="sm">Selected route</Text>
            {selectedTrip ? <Badge variant="outline" color="gray">{selectedTrip.recordCount} points · {selectedTrip.status}</Badge> : null}
          </Group>
          <div className="history-map-stage">
            <DeviceMap
              variant="history"
              devices={mapDevices}
              positions={positions}
              configRevisions={emptyConfigRevisions}
              selectedImei={imei}
              selectedPositionId={selectedRecordId}
              onSelectPosition={selectPosition}
            />
            {selectedRecord ? (
              <HistoryPointOverlay record={selectedRecord} onClose={() => setSelectedRecordId("")} />
            ) : null}
          </div>
        </div>
      </div>
    </Paper>
  );
});

async function requestHistoryRoute(
  tripId: string,
  from: string,
  to: string,
): Promise<{ records: HistoryRecord[]; truncated: boolean }> {
  const records: HistoryRecord[] = [];
  let cursor: string | undefined;
  let pageCount = 0;
  do {
    pageCount += 1;
    const page = await request<HistoryPage<HistoryRecord>>(
      `/api/history/trips/${encodeURIComponent(tripId)}/route?${historyQuery(from, to, HISTORY_PAGE_SIZE, cursor)}`,
    );
    records.push(...page.items.slice(0, MAX_HISTORY_ROUTE_POINTS - records.length));
    cursor = page.nextCursor;
  } while (cursor && records.length < MAX_HISTORY_ROUTE_POINTS && pageCount < MAX_HISTORY_ROUTE_POINTS / HISTORY_PAGE_SIZE);
  return { records, truncated: Boolean(cursor) };
}

function historyQuery(from: string, to: string, limit: number, cursor?: string): URLSearchParams {
  const parameters = new URLSearchParams({ limit: String(limit) });
  if (from) parameters.set("from", new Date(from).toISOString());
  if (to) parameters.set("to", new Date(to).toISOString());
  if (cursor) parameters.set("cursor", cursor);
  return parameters;
}

function validHistoryRange(from: string, to: string): boolean {
  return !from || !to || new Date(from).getTime() <= new Date(to).getTime();
}

function HistoryPointOverlay({ record, onClose }: { record: HistoryRecord; onClose: () => void }): ReactElement {
  return (
    <aside className="history-point-overlay" aria-label="Selected historical point telemetry" role="dialog">
      <div className="history-point-overlay-header">
        <Box>
          <Text size="xs" c="dimmed">Selected point</Text>
          <Text fw={650} size="sm">Point telemetry</Text>
        </Box>
        <ActionIcon variant="subtle" size="sm" aria-label="Close point details" onClick={onClose}>
          <X size={16} />
        </ActionIcon>
      </div>
      <ScrollArea className="history-telemetry-scroll" offsetScrollbars>
        <Stack gap="sm" mt="sm">
          <Box>
            <Text size="xs" c="dimmed">Timestamp</Text>
            <Text size="sm" fw={600}>{new Date(record.timestampMs).toLocaleString()}</Text>
            <Code mt={5}>{record.id}</Code>
          </Box>
          <SimpleGrid cols={2} spacing="xs">
            <HistoryMetric label="Coordinates" value={`${record.latitude.toFixed(6)}, ${record.longitude.toFixed(6)}`} />
            <HistoryMetric label="Speed" value={`${record.speedKph} km/h`} />
            <HistoryMetric label="Altitude" value={`${record.altitudeMeters} m`} />
            <HistoryMetric label="Heading" value={`${record.headingDegrees}°`} />
            <HistoryMetric label="Satellites" value={String(record.satellites)} />
            <HistoryMetric label="Frame" value={record.frameId} />
          </SimpleGrid>
          <TelemetrySummary telemetry={record.telemetry} />
        </Stack>
      </ScrollArea>
    </aside>
  );
}

function HistoryMetric({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <Box className="history-metric">
      <Text size="xs" c="dimmed">{label}</Text>
      <Text size="sm" fw={600} truncate title={value}>{value}</Text>
    </Box>
  );
}
