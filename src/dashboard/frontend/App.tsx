import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Code,
  Divider,
  Drawer,
  Group,
  Modal,
  NumberInput,
  Paper,
  ScrollArea,
  Select,
  SimpleGrid,
  Slider,
  Stack,
  Tabs,
  Text,
  TextInput,
  Title,
  Tooltip,
  UnstyledButton
} from "@mantine/core";
import { Activity, Filter, History, Pencil, Play, Plus, RadioTower, RefreshCw, Square, Trash2 } from "lucide-react";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type FormEvent, type ReactElement } from "react";

import { ColorSchemeToggle } from "./ColorSchemeToggle";
import { DeviceMap, type MapConfigRevision, type MapPosition } from "./DeviceMap";
import { LogRow, type FrontendLogEvent } from "./LogRow";
import { historyRecordsToTrackPositions } from "./map-tracks";
import { TelemetrySummary, type TelemetrySnapshot } from "./TelemetrySummary";

type Status = "configured" | "starting" | "running" | "reconnecting" | "stopped" | "rejected" | "failed" | "completed" | "interrupted";
type DeviceConfig = { host: string; port: number; intervalMs: number; simulationSpeed: number; reconnectDelayMs: number; routeFile?: string; drivingStyle: string; seed: number; deviceProfile: string; packetCount?: number };
type Device = { imei: string; label: string; config: DeviceConfig; configRevision: number };
type DeviceStatus = Device & { status: Status; updatedAtMs: number; lastStartAtMs?: number; lastStopAtMs?: number; lastError?: string };
type Overview = { total: number; counts: Record<Status, number> };
type HistoryDevice = { imei: string; label: string; source: string; archived: boolean };
type HistoryTrip = { id: string; status: string; acceptedRecordCount: number; recordCount: number; startedAtMs: number; finishedAtMs?: number };
type HistoryRecord = {
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
};
type HistoryPage<TItem> = { items: TItem[]; nextCursor?: string };

const emptyConfig: DeviceConfig = { host: "127.0.0.1", port: 5027, intervalMs: 1000, simulationSpeed: 0, reconnectDelayMs: 3000, routeFile: "routes/krakow-berlin.route.json", drivingStyle: "normal", seed: 1, deviceProfile: "fmc650-fms", packetCount: 1_000 };
const emptyForm = { imei: "", label: "FMC650 test device", config: { ...emptyConfig } };
const activeStatuses = new Set<Status>(["starting", "running", "reconnecting"]);
const SUMMARY_POLL_INTERVAL_MS = 2_000;
const POSITION_POLL_INTERVAL_MS = 4_000;
const LOG_POLL_INTERVAL_MS = 2_000;
const HISTORY_PAGE_SIZE = 500;
const MAX_HISTORY_ROUTE_POINTS = 2_000;
const emptyConfigRevisions: MapConfigRevision[] = [];
const predefinedRoutes = [
  ["", "Built-in fallback (Vilnius)"],
  ["tests/fixtures/city-loop.route.json", "City loop (Vilnius)"],
  ["routes/krakow-berlin.route.json", "Kraków → Berlin (605.6 km)"],
  ["routes/munich-rome.route.json", "Monachium → Rzym (915.7 km)"]
] as const;
const generateImei = () => Array.from(crypto.getRandomValues(new Uint8Array(15)), (byte) => byte % 10).join("");

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
  if (!response.ok) {
    const body = await response.json().catch(() => undefined) as { error?: { message?: string } } | undefined;
    throw new Error(body?.error?.message ?? `${response.status} ${response.statusText}`);
  }
  return response.status === 204 ? (undefined as T) : response.json() as Promise<T>;
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
  } while (
    cursor
    && records.length < MAX_HISTORY_ROUTE_POINTS
    && pageCount < MAX_HISTORY_ROUTE_POINTS / HISTORY_PAGE_SIZE
  );

  return { records, truncated: Boolean(cursor) };
}

function numberValue(value: string | number): number | undefined {
  return value === "" ? undefined : Number(value);
}

function statusColor(status: Status): string {
  if (status === "running") return "teal";
  if (status === "starting" || status === "reconnecting") return "blue";
  if (status === "failed" || status === "rejected") return "red";
  return "gray";
}

function actionLabel(status: Status): string {
  return status === "starting" || status === "reconnecting" ? "Starting…" : status === "running" ? "Stop" : "Start";
}

function samePositions(current: readonly MapPosition[], next: readonly MapPosition[]): boolean {
  if (current.length !== next.length) return false;
  for (let index = 0; index < current.length; index += 1) {
    const left = current[index]!;
    const right = next[index]!;
    if (
      left.imei !== right.imei
      || left.tripId !== right.tripId
      || left.configRevision !== right.configRevision
      || left.timestampMs !== right.timestampMs
      || left.latitude !== right.latitude
      || left.longitude !== right.longitude
    ) return false;
  }
  return true;
}

function sameConfigRevisions(current: readonly MapConfigRevision[], next: readonly MapConfigRevision[]): boolean {
  if (current.length !== next.length) return false;
  for (let index = 0; index < current.length; index += 1) {
    const left = current[index]!;
    const right = next[index]!;
    if (
      left.imei !== right.imei
      || left.configRevision !== right.configRevision
      || left.createdAtMs !== right.createdAtMs
    ) return false;
  }
  return true;
}

function sameDevices(current: readonly Device[], next: readonly Device[]): boolean {
  if (current.length !== next.length) return false;
  return current.every((device, index) => {
    const candidate = next[index];
    return candidate !== undefined
      && device.imei === candidate.imei
      && device.label === candidate.label
      && device.configRevision === candidate.configRevision;
  });
}

function sameHistoryDevices(current: readonly HistoryDevice[], next: readonly HistoryDevice[]): boolean {
  if (current.length !== next.length) return false;
  return current.every((device, index) => {
    const candidate = next[index];
    return candidate !== undefined
      && device.imei === candidate.imei
      && device.label === candidate.label
      && device.source === candidate.source
      && device.archived === candidate.archived;
  });
}

function sameStatuses(current: readonly DeviceStatus[], next: readonly DeviceStatus[]): boolean {
  if (current.length !== next.length) return false;
  return current.every((status, index) => {
    const candidate = next[index];
    return candidate !== undefined
      && status.imei === candidate.imei
      && status.status === candidate.status
      && status.updatedAtMs === candidate.updatedAtMs
      && status.lastError === candidate.lastError;
  });
}

function sameOverview(current: Overview, next: Overview): boolean {
  if (current.total !== next.total) return false;
  return (Object.keys(current.counts) as Status[]).every((status) => current.counts[status] === next.counts[status]);
}

function sameLogs(current: readonly FrontendLogEvent[], next: readonly FrontendLogEvent[]): boolean {
  if (current.length !== next.length) return false;
  return current.every((log, index) => log.id === next[index]?.id);
}

export function App(): ReactElement {
  const [devices, setDevices] = useState<Device[]>([]);
  const [historyDevices, setHistoryDevices] = useState<HistoryDevice[]>([]);
  const [statuses, setStatuses] = useState<DeviceStatus[]>([]);
  const [overview, setOverview] = useState<Overview>({ total: 0, counts: { configured: 0, starting: 0, running: 0, reconnecting: 0, stopped: 0, rejected: 0, failed: 0, completed: 0, interrupted: 0 } });
  const [logs, setLogs] = useState<FrontendLogEvent[]>([]);
  const [positions, setPositions] = useState<MapPosition[]>([]);
  const [configRevisions, setConfigRevisions] = useState<MapConfigRevision[]>([]);
  const [selectedImei, setSelectedImei] = useState("");
  const [logImei, setLogImei] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [severity, setSeverity] = useState("");
  const [eventType, setEventType] = useState("");
  const [deviceModalOpen, setDeviceModalOpen] = useState(false);
  const [logsDrawerOpen, setLogsDrawerOpen] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [historyImei, setHistoryImei] = useState("");
  const [historyTrips, setHistoryTrips] = useState<HistoryTrip[]>([]);
  const [selectedTripId, setSelectedTripId] = useState("");
  const [historyRecords, setHistoryRecords] = useState<HistoryRecord[]>([]);
  const [selectedHistoryRecordId, setSelectedHistoryRecordId] = useState("");
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [historyTripsTruncated, setHistoryTripsTruncated] = useState(false);
  const [historyRouteTruncated, setHistoryRouteTruncated] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const summaryPolling = useRef(false);
  const positionPolling = useRef(false);
  const logPolling = useRef(false);
  const historyTripsRequest = useRef(0);
  const historyRouteRequest = useRef(0);
  const deferredEventType = useDeferredValue(eventType);

  const refreshSummary = useCallback(async (force = false) => {
    if ((!force && document.hidden) || summaryPolling.current) return;
    summaryPolling.current = true;
    try {
      const [deviceResponse, historyDeviceResponse, statusResponse, overviewResponse] = await Promise.all([
        request<{ devices: Device[] }>("/api/devices"),
        request<{ devices: HistoryDevice[] }>("/api/history/devices"),
        request<{ devices: DeviceStatus[] }>("/api/status/devices"),
        request<Overview>("/api/status/overview"),
      ]);
      setDevices((current) => sameDevices(current, deviceResponse.devices) ? current : deviceResponse.devices);
      setHistoryDevices((current) => sameHistoryDevices(current, historyDeviceResponse.devices) ? current : historyDeviceResponse.devices);
      setStatuses((current) => sameStatuses(current, statusResponse.devices) ? current : statusResponse.devices);
      setOverview((current) => sameOverview(current, overviewResponse) ? current : overviewResponse);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Status refresh failed");
    } finally {
      summaryPolling.current = false;
    }
  }, []);

  const refreshPositions = useCallback(async (force = false) => {
    if ((!force && document.hidden) || positionPolling.current) return;
    positionPolling.current = true;
    try {
      const positionResponse = await request<{ positions: MapPosition[]; configRevisions: MapConfigRevision[] }>("/api/status/positions");
      setPositions((current) => samePositions(current, positionResponse.positions) ? current : positionResponse.positions);
      setConfigRevisions((current) => sameConfigRevisions(current, positionResponse.configRevisions) ? current : positionResponse.configRevisions);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Position refresh failed");
    } finally {
      positionPolling.current = false;
    }
  }, []);

  const refreshLogs = useCallback(async (force = false) => {
    if (!logsDrawerOpen || !logImei || (!force && document.hidden) || logPolling.current) return;
    logPolling.current = true;
    try {
      const response = await request<{ events: FrontendLogEvent[] }>(`/api/logs?limit=100&imei=${encodeURIComponent(logImei)}${severity ? `&severity=${encodeURIComponent(severity)}` : ""}${deferredEventType ? `&type=${encodeURIComponent(deferredEventType)}` : ""}`);
      setLogs((current) => sameLogs(current, response.events) ? current : response.events);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Log refresh failed");
    } finally {
      logPolling.current = false;
    }
  }, [deferredEventType, logImei, logsDrawerOpen, severity]);

  const loadHistoryRoute = useCallback(async (tripId: string, from: string, to: string) => {
    const requestId = ++historyRouteRequest.current;
    if (!tripId) {
      setHistoryRecords([]);
      setSelectedHistoryRecordId("");
      setHistoryRouteTruncated(false);
      return;
    }
    if (!validHistoryRange(from, to)) {
      setError("History start time must not be later than its end time.");
      return;
    }

    setHistoryLoading(true);
    setError("");
    try {
      const result = await requestHistoryRoute(tripId, from, to);
      if (historyRouteRequest.current !== requestId) return;
      setHistoryRecords(result.records);
      setHistoryRouteTruncated(result.truncated);
      setSelectedHistoryRecordId(result.records.at(-1)?.id ?? "");
    } catch (historyError) {
      if (historyRouteRequest.current === requestId) {
        setError(historyError instanceof Error ? historyError.message : "Trip history refresh failed");
      }
    } finally {
      if (historyRouteRequest.current === requestId) setHistoryLoading(false);
    }
  }, []);

  const loadHistoryTrips = useCallback(async (imei: string, from: string, to: string) => {
    const requestId = ++historyTripsRequest.current;
    historyRouteRequest.current += 1;
    if (!imei) {
      setHistoryTrips([]);
      setSelectedTripId("");
      setHistoryRecords([]);
      return;
    }
    if (!validHistoryRange(from, to)) {
      setError("History start time must not be later than its end time.");
      return;
    }

    setHistoryLoading(true);
    setError("");
    try {
      const page = await request<HistoryPage<HistoryTrip>>(
        `/api/history/devices/${encodeURIComponent(imei)}/trips?${historyQuery(from, to, 100)}`,
      );
      if (historyTripsRequest.current !== requestId) return;
      setHistoryTrips(page.items);
      setHistoryTripsTruncated(Boolean(page.nextCursor));
      const nextTripId = page.items[0]?.id ?? "";
      setSelectedTripId(nextTripId);
      if (nextTripId) await loadHistoryRoute(nextTripId, from, to);
      else {
        setHistoryRecords([]);
        setSelectedHistoryRecordId("");
        setHistoryRouteTruncated(false);
      }
    } catch (historyError) {
      if (historyTripsRequest.current === requestId) {
        setError(historyError instanceof Error ? historyError.message : "Trip list refresh failed");
      }
    } finally {
      if (historyTripsRequest.current === requestId) setHistoryLoading(false);
    }
  }, [loadHistoryRoute]);

  useEffect(() => {
    void refreshSummary(true);
    const interval = window.setInterval(() => void refreshSummary(), SUMMARY_POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [refreshSummary]);

  useEffect(() => {
    void refreshPositions(true);
    const interval = window.setInterval(() => void refreshPositions(), POSITION_POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [refreshPositions]);

  useEffect(() => {
    if (!logsDrawerOpen || !logImei) return undefined;
    void refreshLogs(true);
    const interval = window.setInterval(() => void refreshLogs(), LOG_POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [logImei, logsDrawerOpen, refreshLogs]);

  const statusByImei = useMemo(() => new Map(statuses.map((status) => [status.imei, status])), [statuses]);
  const selectedDevice = devices.find((device) => device.imei === selectedImei);
  const formStatus = form.imei ? statusByImei.get(form.imei) : undefined;
  const formActive = formStatus ? activeStatuses.has(formStatus.status) : false;
  const runningCount = overview.counts.running + overview.counts.starting + overview.counts.reconnecting;
  const mapDevices = useMemo(
    () => devices.map((device) => ({ ...device, status: statusByImei.get(device.imei)?.status ?? "configured" })),
    [devices, statusByImei],
  );
  const newestLogs = useMemo(() => [...logs].reverse(), [logs]);
  const selectedTrip = historyTrips.find((trip) => trip.id === selectedTripId);
  const selectedHistoryRecord = historyRecords.find((record) => record.id === selectedHistoryRecordId);
  const historyPositions = useMemo(
    () => historyRecordsToTrackPositions(historyRecords, historyImei, selectedTripId),
    [historyImei, historyRecords, selectedTripId],
  );
  const historyMapDevices = useMemo(() => {
    if (!historyImei) return [];
    const device = historyDevices.find((candidate) => candidate.imei === historyImei);
    return [{ imei: historyImei, label: device?.label ?? historyImei, status: "stored" }];
  }, [historyDevices, historyImei]);
  const historyDeviceOptions = useMemo(
    () => historyDevices.map((device) => ({
      value: device.imei,
      label: `${device.label} · ${device.imei}${device.archived ? " · archived" : ""}`,
    })),
    [historyDevices],
  );
  const historyTripOptions = useMemo(
    () => historyTrips.map((trip) => ({
      value: trip.id,
      label: `${new Date(trip.startedAtMs).toLocaleString()} · ${trip.recordCount} points · ${trip.status}`,
    })),
    [historyTrips],
  );

  const selectHistoryDevice = useCallback((imei: string | null) => {
    const nextImei = imei ?? "";
    setHistoryImei(nextImei);
    setHistoryTrips([]);
    setSelectedTripId("");
    setHistoryRecords([]);
    setSelectedHistoryRecordId("");
    void loadHistoryTrips(nextImei, historyFrom, historyTo);
  }, [historyFrom, historyTo, loadHistoryTrips]);

  const selectHistoryTrip = useCallback((tripId: string | null) => {
    const nextTripId = tripId ?? "";
    setSelectedTripId(nextTripId);
    setHistoryRecords([]);
    setSelectedHistoryRecordId("");
    void loadHistoryRoute(nextTripId, historyFrom, historyTo);
  }, [historyFrom, historyTo, loadHistoryRoute]);

  const selectHistoryPosition = useCallback((position: MapPosition) => {
    if (position.id) setSelectedHistoryRecordId(position.id);
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      refreshSummary(true),
      refreshPositions(true),
      refreshLogs(true),
    ]);
  }, [refreshLogs, refreshPositions, refreshSummary]);

  const setActionBusy = (key: string, value: boolean) => setBusy((current) => ({ ...current, [key]: value }));
  const runAction = async (key: string, operation: () => Promise<unknown>) => {
    if (busy[key]) return;
    setActionBusy(key, true);
    setError("");
    try {
      await operation();
      setMessage("Action accepted; status will refresh shortly.");
      await refreshAll();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Action failed");
    } finally {
      setActionBusy(key, false);
    }
  };

  const resetForm = () => setForm({ ...emptyForm, config: { ...emptyConfig } });
  const openCreateModal = () => {
    setSelectedImei("");
    resetForm();
    setDeviceModalOpen(true);
  };
  const openEditModal = (device: Device) => {
    setSelectedImei(device.imei);
    setForm({ imei: device.imei, label: device.label, config: { ...emptyConfig, ...device.config } });
    setDeviceModalOpen(true);
  };
  const openDeviceLogs = (device: Device) => {
    setSelectedImei(device.imei);
    setLogImei(device.imei);
    setLogsDrawerOpen(true);
  };
  const submitDevice = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!form.imei.trim() || !form.label.trim()) {
      setError("IMEI and label are required.");
      return;
    }
    const payload = { label: form.label, config: { ...form.config, routeFile: form.config.routeFile || undefined } };
    await runAction("save", async () => {
      if (devices.some((device) => device.imei === form.imei)) await request(`/api/devices/${encodeURIComponent(form.imei)}`, { method: "PATCH", body: JSON.stringify(payload) });
      else await request("/api/devices", { method: "POST", body: JSON.stringify({ imei: form.imei, ...payload }) });
      setDeviceModalOpen(false);
      resetForm();
    });
  };

  const changeConfig = (name: keyof DeviceConfig, value: string | number) => setForm((current) => ({ ...current, config: { ...current.config, [name]: ["port", "intervalMs", "simulationSpeed", "reconnectDelayMs", "seed", "packetCount"].includes(name) ? numberValue(value) : value } }));
  const clearState = () => {
    if (window.confirm("Clear devices, runtime history, and logs?")) void runAction("clear-state", async () => {
      await request("/api/status/state", { method: "DELETE" });
      setSelectedImei("");
      setLogImei("");
      setLogsDrawerOpen(false);
      setDeviceModalOpen(false);
      resetForm();
    });
  };
  const clearLogs = () => {
    if (!logImei) return;
    void runAction("clear-logs", () => request(`/api/logs/devices/${encodeURIComponent(logImei)}`, { method: "DELETE" }));
  };

  return (
    <Box component="main" className="dashboard-shell">
      <Box className="dashboard-frame">
        <header className="topbar" data-active={runningCount > 0 || undefined}>
          <Group gap="sm">
            <Box className="brand-mark"><Activity size={18} strokeWidth={2.2} /></Box>
            <Box className="brand-copy">
              <Text className="brand-eyebrow">AVL protocol workbench</Text>
              <Title order={1}>Teltonika Simulator</Title>
            </Box>
          </Group>
          <Group gap="xs" className="topbar-actions">
            <Tooltip label="Device protocol endpoint — not an HTTP page"><Badge variant="outline" color="gray">TCP :5027</Badge></Tooltip>
            <Badge variant="light" color={runningCount > 0 ? "teal" : "gray"}>{runningCount} active</Badge>
            <Text size="sm" c="dimmed">{overview.total} devices</Text>
            <Button leftSection={<Plus size={15} />} onClick={openCreateModal}>Add device</Button>
            <ColorSchemeToggle />
            <Tooltip label="Refresh"><ActionIcon size="lg" variant="subtle" aria-label="Refresh" onClick={() => void refreshAll()}><RefreshCw size={16} /></ActionIcon></Tooltip>
            <Tooltip label="Clear devices, runtime history, and logs"><ActionIcon size="lg" variant="subtle" color="red" aria-label="Clear dashboard state" onClick={clearState}><Trash2 size={16} /></ActionIcon></Tooltip>
          </Group>
        </header>

        <Stack gap="sm">
          {message && <Alert color="teal" variant="light" withCloseButton onClose={() => setMessage("")}>{message}</Alert>}
          {error && <Alert color="red" variant="light" withCloseButton onClose={() => setError("")}>{error}</Alert>}

          <Tabs defaultValue="live" keepMounted={false} className="workspace-tabs">
            <Tabs.List className="workspace-tab-list" aria-label="Dashboard sections">
              <Tabs.Tab
                value="live"
                className="workspace-tab"
                leftSection={<RadioTower size={16} />}
                rightSection={<span className="workspace-tab-meta">{devices.length}</span>}
              >
                Live &amp; devices
              </Tabs.Tab>
              <Tabs.Tab
                value="history"
                className="workspace-tab"
                leftSection={<History size={16} />}
                rightSection={<span className="workspace-tab-meta">Archive</span>}
              >
                Trip history
              </Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="live" className="workspace-tab-panel">
              <div className="workspace-grid">
                <Paper withBorder className="surface map-surface">
                  <Group justify="space-between" align="flex-start" className="surface-heading">
                    <Box>
                      <Text className="section-kicker">Live routes</Text>
                      <Title order={2}>Live map</Title>
                    </Box>
                    {selectedDevice && <Badge variant="outline" color="gray">Focused: {selectedDevice.label}</Badge>}
                  </Group>
                  <DeviceMap devices={mapDevices} positions={positions} configRevisions={configRevisions} selectedImei={selectedImei} />
                </Paper>

                <Paper withBorder className="surface device-panel">
                  <Group justify="space-between" className="surface-heading">
                    <Box>
                      <Text className="section-kicker">Fleet roster</Text>
                      <Title order={2}>Devices</Title>
                    </Box>
                    <Badge variant="light" color="gray">{devices.length}</Badge>
                  </Group>
                  <Group gap="xs" grow mb="md">
                    <Button size="xs" variant="default" leftSection={<Play size={13} />} onClick={() => void runAction("start-all", () => request("/api/runtime/start-all", { method: "POST" }))}>Start all</Button>
                    <Button size="xs" variant="light" color="red" leftSection={<Square size={12} />} onClick={() => void runAction("stop-all", () => request("/api/runtime/stop-all", { method: "POST" }))}>Stop all</Button>
                  </Group>

                  {devices.length === 0 ? <Box className="empty-state"><Text fw={600}>No devices configured</Text><Button mt="md" size="xs" variant="default" onClick={openCreateModal}>Create device</Button></Box> : (
                    <ScrollArea className="device-scroll" offsetScrollbars>
                      <Stack gap="xs">{devices.map((device) => {
                        const status = statusByImei.get(device.imei);
                        const deviceStatus = status?.status ?? "configured";
                        const active = activeStatuses.has(deviceStatus);
                        return (
                          <Paper key={device.imei} withBorder className="device-card" data-selected={selectedImei === device.imei || undefined}>
                            <UnstyledButton className="device-card-main" onClick={() => openDeviceLogs(device)}>
                              <Group justify="space-between" gap="xs" wrap="nowrap"><Text fw={650} size="sm" truncate>{device.label}</Text><Badge size="xs" variant="light" color={statusColor(deviceStatus)}>{deviceStatus}</Badge></Group>
                              <Text size="xs" c="dimmed" mt={4} ff="monospace">{device.imei}</Text>
                              {status?.lastError && <Text size="xs" c="red" mt={5} lineClamp={1}>{status.lastError}</Text>}
                            </UnstyledButton>
                            <Group justify="space-between" className="device-card-actions">
                              <Button size="compact-xs" variant={active ? "light" : "default"} color={active ? "red" : undefined} loading={busy[device.imei]} disabled={deviceStatus === "starting" || deviceStatus === "reconnecting"} onClick={() => void runAction(device.imei, () => request(`/api/runtime/devices/${encodeURIComponent(device.imei)}/${active ? "stop" : "start"}`, { method: "POST" }))}>{actionLabel(deviceStatus)}</Button>
                              <Group gap={2}>
                                <Tooltip label={active ? "Edit live simulation settings" : "Edit device"}><ActionIcon variant="subtle" aria-label={`Edit ${device.label}`} onClick={() => openEditModal(device)}><Pencil size={14} /></ActionIcon></Tooltip>
                                <Tooltip label="Delete device"><ActionIcon variant="subtle" color="red" aria-label={`Delete ${device.label}`} disabled={active || busy[`delete-${device.imei}`]} onClick={() => void runAction(`delete-${device.imei}`, async () => { await request(`/api/devices/${encodeURIComponent(device.imei)}`, { method: "DELETE" }); if (selectedImei === device.imei) { setSelectedImei(""); setLogsDrawerOpen(false); } })}><Trash2 size={14} /></ActionIcon></Tooltip>
                              </Group>
                            </Group>
                          </Paper>
                        );
                      })}</Stack>
                    </ScrollArea>
                  )}
                </Paper>
              </div>
            </Tabs.Panel>

            <Tabs.Panel value="history" className="workspace-tab-panel">
              <Paper withBorder className="surface history-surface">
            <Group justify="space-between" align="flex-start" className="surface-heading">
              <Box>
                <Text className="section-kicker">Trip archive</Text>
                <Title order={2}>Trip history</Title>
                <Text size="xs" c="dimmed">Stored routes and telemetry · loaded on demand</Text>
              </Box>
              <Group gap="xs">
                {historyTripsTruncated ? <Badge variant="light" color="yellow">Newest 100 trips</Badge> : null}
                {historyRouteTruncated ? <Badge variant="light" color="yellow">First {MAX_HISTORY_ROUTE_POINTS} points</Badge> : null}
              </Group>
            </Group>

            <SimpleGrid cols={{ base: 1, sm: 2, lg: 5 }} className="history-filters">
              <Select
                label="Device"
                placeholder="Select a device"
                searchable
                clearable
                value={historyImei || null}
                data={historyDeviceOptions}
                onChange={selectHistoryDevice}
              />
              <Select
                label="Trip"
                placeholder={historyImei ? "Select a trip" : "Select a device first"}
                searchable
                clearable
                disabled={!historyImei || historyTrips.length === 0}
                value={selectedTripId || null}
                data={historyTripOptions}
                onChange={selectHistoryTrip}
              />
              <TextInput label="From" type="datetime-local" value={historyFrom} onChange={(event) => setHistoryFrom(event.target.value)} />
              <TextInput label="To" type="datetime-local" value={historyTo} onChange={(event) => setHistoryTo(event.target.value)} />
              <Button
                className="history-load-button"
                variant="default"
                loading={historyLoading}
                disabled={!historyImei}
                leftSection={<RefreshCw size={14} />}
                onClick={() => void loadHistoryTrips(historyImei, historyFrom, historyTo)}
              >
                Load history
              </Button>
            </SimpleGrid>

            <div className="history-grid">
              <div className="history-map-panel">
                <Group justify="space-between" mb="xs">
                  <Text fw={650} size="sm">Selected route</Text>
                  {selectedTrip ? (
                    <Badge variant="outline" color="gray">
                      {selectedTrip.recordCount} points · {selectedTrip.status}
                    </Badge>
                  ) : null}
                </Group>
                <DeviceMap
                  variant="history"
                  devices={historyMapDevices}
                  positions={historyPositions}
                  configRevisions={emptyConfigRevisions}
                  selectedImei={historyImei}
                  selectedPositionId={selectedHistoryRecordId}
                  onSelectPosition={selectHistoryPosition}
                />
              </div>

              <aside className="history-telemetry-panel" aria-label="Selected historical point telemetry">
                <Text fw={650} size="sm">Point telemetry</Text>
                {selectedHistoryRecord ? (
                  <ScrollArea className="history-telemetry-scroll" offsetScrollbars>
                    <Stack gap="sm" mt="sm">
                      <Box>
                        <Text size="xs" c="dimmed">Timestamp</Text>
                        <Text size="sm" fw={600}>{new Date(selectedHistoryRecord.timestampMs).toLocaleString()}</Text>
                        <Code mt={5}>{selectedHistoryRecord.id}</Code>
                      </Box>
                      <SimpleGrid cols={2} spacing="xs">
                        <HistoryMetric label="Coordinates" value={`${selectedHistoryRecord.latitude.toFixed(6)}, ${selectedHistoryRecord.longitude.toFixed(6)}`} />
                        <HistoryMetric label="Speed" value={`${selectedHistoryRecord.speedKph} km/h`} />
                        <HistoryMetric label="Altitude" value={`${selectedHistoryRecord.altitudeMeters} m`} />
                        <HistoryMetric label="Heading" value={`${selectedHistoryRecord.headingDegrees}°`} />
                        <HistoryMetric label="Satellites" value={String(selectedHistoryRecord.satellites)} />
                        <HistoryMetric label="Frame" value={selectedHistoryRecord.frameId} />
                      </SimpleGrid>
                      <TelemetrySummary telemetry={selectedHistoryRecord.telemetry} />
                    </Stack>
                  </ScrollArea>
                ) : (
                  <Box className="empty-state history-empty-state">
                    <Text fw={600}>No point selected</Text>
                    <Text size="sm" c="dimmed">Load a trip, then select a point on the stored route.</Text>
                  </Box>
                )}
              </aside>
            </div>
              </Paper>
            </Tabs.Panel>
          </Tabs>
        </Stack>
      </Box>

      <Modal opened={deviceModalOpen} onClose={() => setDeviceModalOpen(false)} title="Device setup" size="lg" centered>
        {formActive && <Alert color="blue" variant="light" mb="md">Live simulation changes apply from the next AVL packet. Connection and route fields stay locked while the device is active.</Alert>}
        <form onSubmit={submitDevice}>
          <Stack gap="md">
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <TextInput label="IMEI" placeholder="15 digits" value={form.imei} disabled={devices.some((device) => device.imei === form.imei) || formActive} onChange={(event) => setForm({ ...form, imei: event.target.value })} rightSection={<Tooltip label="Generate IMEI"><ActionIcon variant="subtle" aria-label="Generate IMEI" disabled={Boolean(form.imei) || formActive} onClick={() => setForm((current) => ({ ...current, imei: generateImei() }))}><RefreshCw size={14} /></ActionIcon></Tooltip>} />
              <TextInput label="Display name" value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} />
            </SimpleGrid>
            <Divider label="TCP endpoint and simulation" labelPosition="left" />
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <TextInput label="TCP host" value={form.config.host} disabled={formActive} onChange={(event) => changeConfig("host", event.target.value)} />
              <NumberInput label="TCP port" description="Device protocol; do not open in a browser" value={form.config.port} disabled={formActive} allowDecimal={false} onChange={(value) => changeConfig("port", value)} />
              <NumberInput label="Interval (ms)" value={form.config.intervalMs} allowDecimal={false} onChange={(value) => changeConfig("intervalMs", value)} />
              <NumberInput label="Reconnect delay (ms)" value={form.config.reconnectDelayMs} disabled={formActive} allowDecimal={false} onChange={(value) => changeConfig("reconnectDelayMs", value)} />
              <Select label="Driving style" value={form.config.drivingStyle} allowDeselect={false} data={[{ value: "eco", label: "Eco" }, { value: "normal", label: "Normal" }, { value: "aggressive", label: "Aggressive" }]} onChange={(value) => value && changeConfig("drivingStyle", value)} />
              <NumberInput label="Seed" value={form.config.seed} allowDecimal={false} onChange={(value) => changeConfig("seed", value)} />
              <NumberInput label="Packet limit" value={form.config.packetCount} allowDecimal={false} onChange={(value) => changeConfig("packetCount", value)} />
              <Select label="Device profile" value={form.config.deviceProfile} allowDeselect={false} data={[{ value: "default-codec8e", label: "Default Codec 8E" }, { value: "fmc003", label: "FMC003" }, { value: "fmc150", label: "FMC150" }, { value: "fmc250", label: "FMC250" }, { value: "fmc650-fms", label: "FMC650 FMS/J1939" }]} onChange={(value) => value && changeConfig("deviceProfile", value)} />
            </SimpleGrid>
            <Select label="Predefined route" value={form.config.routeFile ?? ""} disabled={formActive} allowDeselect={false} data={[...predefinedRoutes.map(([value, label]) => ({ value, label })), ...form.config.routeFile && !predefinedRoutes.some(([path]) => path === form.config.routeFile) ? [{ value: form.config.routeFile, label: `${form.config.routeFile} (custom)` }] : []]} onChange={(value) => changeConfig("routeFile", value ?? "")} />
            <Box><Group justify="space-between" mb={5}><Text size="sm" fw={500}>Simulation speed</Text><Text size="xs" c="dimmed">{form.config.simulationSpeed < 0 ? `${Math.abs(form.config.simulationSpeed)}× slower` : form.config.simulationSpeed > 0 ? `${form.config.simulationSpeed}× faster` : "Real time"}</Text></Group><Slider min={-10} max={10} step={1} value={form.config.simulationSpeed} label={null} onChange={(value) => changeConfig("simulationSpeed", value)} /></Box>
            <Group justify="flex-end"><Button variant="default" onClick={() => setDeviceModalOpen(false)}>Cancel</Button><Button type="submit" loading={busy.save}>{devices.some((device) => device.imei === form.imei) ? "Save changes" : "Create device"}</Button></Group>
          </Stack>
        </form>
      </Modal>

      <Drawer opened={logsDrawerOpen && Boolean(selectedDevice)} onClose={() => setLogsDrawerOpen(false)} position="right" size={440} title={selectedDevice ? `${selectedDevice.label} logs` : "Recent logs"} withOverlay={false} trapFocus={false} closeOnClickOutside={false} lockScroll={false}>
        <Stack gap="md">
          <Group justify="space-between"><Box><Text size="xs" c="dimmed">IMEI</Text><Code>{selectedDevice?.imei}</Code></Box><Tooltip label="Clear logs"><ActionIcon variant="subtle" color="red" aria-label="Clear logs" onClick={clearLogs}><Trash2 size={16} /></ActionIcon></Tooltip></Group>
          <SimpleGrid cols={2}>
            <Select leftSection={<Filter size={14} />} value={severity} placeholder="All severities" clearable data={["debug", "info", "warn", "error"]} onChange={(value) => setSeverity(value ?? "")} />
            <TextInput value={eventType} onChange={(event) => setEventType(event.target.value)} placeholder="Event type" />
          </SimpleGrid>
          <Text size="xs" c="dimmed">Updates while this drawer is open · newest 100 events</Text>
          {logs.length === 0 ? <Box className="empty-state"><Text fw={600}>No log events</Text><Text size="sm" c="dimmed">Events will appear when this device runs.</Text></Box> : (
            <ScrollArea h="calc(100vh - 210px)" offsetScrollbars>
              <Stack gap={0}>{newestLogs.map((log) => <LogRow key={log.id} log={log} />)}</Stack>
            </ScrollArea>
          )}
        </Stack>
      </Drawer>
    </Box>
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
