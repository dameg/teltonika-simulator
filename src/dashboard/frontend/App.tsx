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
  Text,
  TextInput,
  Title,
  Tooltip,
  UnstyledButton
} from "@mantine/core";
import { Activity, Filter, Pencil, Play, Plus, RefreshCw, Square, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactElement } from "react";

import { DeviceMap, type MapPosition } from "./DeviceMap";

type Status = "configured" | "starting" | "running" | "reconnecting" | "stopped" | "rejected" | "failed" | "completed";
type Severity = "debug" | "info" | "warn" | "error";
type DeviceConfig = { host: string; port: number; intervalMs: number; simulationSpeed: number; reconnectDelayMs: number; routeFile?: string; drivingStyle: string; seed: number; deviceProfile: string; packetCount?: number };
type Device = { imei: string; label: string; config: DeviceConfig };
type DeviceStatus = Device & { status: Status; updatedAtMs: number; lastStartAtMs?: number; lastStopAtMs?: number; lastError?: string };
type Overview = { total: number; counts: Record<Status, number> };
type LogEvent = { id: string; imei?: string; severity: Severity; type: string; message: string; timestampMs: number; data?: unknown };

const emptyConfig: DeviceConfig = { host: "127.0.0.1", port: 5027, intervalMs: 1000, simulationSpeed: 0, reconnectDelayMs: 3000, routeFile: "routes/krakow-berlin.route.json", drivingStyle: "normal", seed: 1, deviceProfile: "fmc650-fms", packetCount: 1_000 };
const emptyForm = { imei: "", label: "FMC650 test device", config: { ...emptyConfig } };
const activeStatuses = new Set<Status>(["starting", "running", "reconnecting"]);
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

function numberValue(value: string | number): number | undefined {
  return value === "" ? undefined : Number(value);
}

function formatTime(value?: number): string {
  return value ? new Date(value).toLocaleTimeString() : "—";
}

function statusColor(status: Status): string {
  if (status === "running") return "teal";
  if (status === "starting" || status === "reconnecting") return "blue";
  if (status === "failed" || status === "rejected") return "red";
  return "gray";
}

function severityColor(severity: Severity): string {
  return severity === "error" ? "red" : severity === "warn" ? "orange" : severity === "info" ? "blue" : "gray";
}

function actionLabel(status: Status): string {
  return status === "starting" || status === "reconnecting" ? "Starting…" : status === "running" ? "Stop" : "Start";
}

export function App(): ReactElement {
  const [devices, setDevices] = useState<Device[]>([]);
  const [statuses, setStatuses] = useState<DeviceStatus[]>([]);
  const [overview, setOverview] = useState<Overview>({ total: 0, counts: { configured: 0, starting: 0, running: 0, reconnecting: 0, stopped: 0, rejected: 0, failed: 0, completed: 0 } });
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [positions, setPositions] = useState<MapPosition[]>([]);
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
  const polling = useRef(false);

  const refresh = useCallback(async () => {
    if (polling.current) return;
    polling.current = true;
    try {
      const [deviceResponse, statusResponse, overviewResponse, logResponse, positionResponse] = await Promise.all([
        request<{ devices: Device[] }>("/api/devices"),
        request<{ devices: DeviceStatus[] }>("/api/status/devices"),
        request<Overview>("/api/status/overview"),
        request<{ events: LogEvent[] }>(`/api/logs?limit=100${logImei ? `&imei=${encodeURIComponent(logImei)}` : ""}${severity ? `&severity=${encodeURIComponent(severity)}` : ""}${eventType ? `&type=${encodeURIComponent(eventType)}` : ""}`),
        request<{ positions: MapPosition[] }>("/api/status/positions")
      ]);
      setDevices(deviceResponse.devices);
      setStatuses(statusResponse.devices);
      setOverview(overviewResponse);
      setLogs(logResponse.events);
      setPositions(positionResponse.positions);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Polling failed");
    } finally {
      polling.current = false;
    }
  }, [eventType, logImei, severity]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 1000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const statusByImei = useMemo(() => new Map(statuses.map((status) => [status.imei, status])), [statuses]);
  const selectedDevice = devices.find((device) => device.imei === selectedImei);
  const formStatus = form.imei ? statusByImei.get(form.imei) : undefined;
  const formActive = formStatus ? activeStatuses.has(formStatus.status) : false;
  const runningCount = overview.counts.running + overview.counts.starting + overview.counts.reconnecting;

  const setActionBusy = (key: string, value: boolean) => setBusy((current) => ({ ...current, [key]: value }));
  const runAction = async (key: string, operation: () => Promise<unknown>) => {
    if (busy[key]) return;
    setActionBusy(key, true);
    setError("");
    try {
      await operation();
      setMessage("Action accepted; status will refresh shortly.");
      await refresh();
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
        <header className="topbar">
          <Group gap="sm">
            <Box className="brand-mark"><Activity size={19} strokeWidth={2.2} /></Box>
            <Box><Title order={1}>Teltonika Device Control</Title><Text size="sm" c="dimmed">Simulator operations</Text></Box>
          </Group>
          <Group gap="xs">
            <Badge variant="light" color="teal">{runningCount} running</Badge>
            <Badge variant="light" color="gray">{overview.total} devices</Badge>
            <Button leftSection={<Plus size={15} />} onClick={openCreateModal}>Add device</Button>
            <Tooltip label="Refresh"><ActionIcon size="lg" variant="default" aria-label="Refresh" onClick={() => void refresh()}><RefreshCw size={16} /></ActionIcon></Tooltip>
            <Tooltip label="Clear devices, runtime history, and logs"><ActionIcon size="lg" variant="subtle" color="red" aria-label="Clear dashboard state" onClick={clearState}><Trash2 size={16} /></ActionIcon></Tooltip>
          </Group>
        </header>

        <Stack gap="sm">
          {message && <Alert color="teal" variant="light" withCloseButton onClose={() => setMessage("")}>{message}</Alert>}
          {error && <Alert color="red" variant="light" withCloseButton onClose={() => setError("")}>{error}</Alert>}

          <div className="workspace-grid">
            <Paper withBorder className="surface map-surface">
              <Group justify="space-between" align="flex-start" className="surface-heading">
                <Box><Title order={2}>Device map</Title><Text size="sm" c="dimmed">Acknowledged positions and route history</Text></Box>
                {selectedDevice && <Badge variant="outline" color="gray">Focused: {selectedDevice.label}</Badge>}
              </Group>
              <DeviceMap devices={devices.map((device) => ({ ...device, status: statusByImei.get(device.imei)?.status ?? "configured" }))} positions={positions} selectedImei={selectedImei} />
            </Paper>

            <Paper withBorder className="surface device-panel">
              <Group justify="space-between" className="surface-heading">
                <Box><Title order={2}>Devices</Title><Text size="sm" c="dimmed">Click a device to inspect logs</Text></Box>
                <ActionIcon variant="light" aria-label="Add device" onClick={openCreateModal}><Plus size={16} /></ActionIcon>
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
                            <Tooltip label={active ? "Stop the device before editing" : "Edit device"}><ActionIcon variant="subtle" aria-label={`Edit ${device.label}`} onClick={() => openEditModal(device)}><Pencil size={14} /></ActionIcon></Tooltip>
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
        </Stack>
      </Box>

      <Modal opened={deviceModalOpen} onClose={() => setDeviceModalOpen(false)} title="Device setup" size="lg" centered>
        {formActive && <Alert color="orange" variant="light" mb="md">Stop this device before changing its configuration.</Alert>}
        <form onSubmit={submitDevice}>
          <Stack gap="md">
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <TextInput label="IMEI" placeholder="15 digits" value={form.imei} disabled={devices.some((device) => device.imei === form.imei) || formActive} onChange={(event) => setForm({ ...form, imei: event.target.value })} rightSection={<Tooltip label="Generate IMEI"><ActionIcon variant="subtle" aria-label="Generate IMEI" disabled={Boolean(form.imei) || formActive} onClick={() => setForm((current) => ({ ...current, imei: generateImei() }))}><RefreshCw size={14} /></ActionIcon></Tooltip>} />
              <TextInput label="Display name" value={form.label} disabled={formActive} onChange={(event) => setForm({ ...form, label: event.target.value })} />
            </SimpleGrid>
            <Divider label="Connection and simulation" labelPosition="left" />
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <TextInput label="Parser host" value={form.config.host} disabled={formActive} onChange={(event) => changeConfig("host", event.target.value)} />
              <NumberInput label="Parser port" value={form.config.port} disabled={formActive} allowDecimal={false} onChange={(value) => changeConfig("port", value)} />
              <NumberInput label="Interval (ms)" value={form.config.intervalMs} disabled={formActive} allowDecimal={false} onChange={(value) => changeConfig("intervalMs", value)} />
              <NumberInput label="Reconnect delay (ms)" value={form.config.reconnectDelayMs} disabled={formActive} allowDecimal={false} onChange={(value) => changeConfig("reconnectDelayMs", value)} />
              <Select label="Driving style" value={form.config.drivingStyle} disabled={formActive} allowDeselect={false} data={[{ value: "eco", label: "Eco" }, { value: "normal", label: "Normal" }, { value: "aggressive", label: "Aggressive" }]} onChange={(value) => value && changeConfig("drivingStyle", value)} />
              <NumberInput label="Seed" value={form.config.seed} disabled={formActive} allowDecimal={false} onChange={(value) => changeConfig("seed", value)} />
              <NumberInput label="Packet limit" value={form.config.packetCount} disabled={formActive} allowDecimal={false} onChange={(value) => changeConfig("packetCount", value)} />
              <Select label="Device profile" value={form.config.deviceProfile} disabled={formActive} allowDeselect={false} data={[{ value: "default-codec8e", label: "Default Codec 8E" }, { value: "fmc650-fms", label: "FMC650 FMS/J1939" }]} onChange={(value) => value && changeConfig("deviceProfile", value)} />
            </SimpleGrid>
            <Select label="Predefined route" value={form.config.routeFile ?? ""} disabled={formActive} allowDeselect={false} data={[...predefinedRoutes.map(([value, label]) => ({ value, label })), ...form.config.routeFile && !predefinedRoutes.some(([path]) => path === form.config.routeFile) ? [{ value: form.config.routeFile, label: `${form.config.routeFile} (custom)` }] : []]} onChange={(value) => changeConfig("routeFile", value ?? "")} />
            <Box><Group justify="space-between" mb={5}><Text size="sm" fw={500}>Simulation speed</Text><Text size="xs" c="dimmed">{form.config.simulationSpeed < 0 ? `${Math.abs(form.config.simulationSpeed)}× slower` : form.config.simulationSpeed > 0 ? `${form.config.simulationSpeed}× faster` : "Real time"}</Text></Group><Slider min={-10} max={10} step={1} value={form.config.simulationSpeed} disabled={formActive} label={null} onChange={(value) => changeConfig("simulationSpeed", value)} /></Box>
            <Group justify="flex-end"><Button variant="default" onClick={() => setDeviceModalOpen(false)}>Cancel</Button><Button type="submit" loading={busy.save} disabled={formActive}>{devices.some((device) => device.imei === form.imei) ? "Save changes" : "Create device"}</Button></Group>
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
          <Text size="xs" c="dimmed">Polling every second · newest 100 events</Text>
          {logs.length === 0 ? <Box className="empty-state"><Text fw={600}>No log events</Text><Text size="sm" c="dimmed">Events will appear when this device runs.</Text></Box> : (
            <ScrollArea h="calc(100vh - 210px)" offsetScrollbars>
              <Stack gap={0}>{[...logs].reverse().map((log) => <Box key={log.id} className="log-row"><Group gap="xs" wrap="nowrap"><Text size="xs" c="dimmed" className="log-time">{formatTime(log.timestampMs)}</Text><Badge size="xs" variant="light" color={severityColor(log.severity)}>{log.severity}</Badge><Text size="sm" fw={600}>{log.type}</Text></Group><Text size="sm" c="dimmed" mt={5}>{log.message}</Text>{log.data !== undefined && <details><summary>JSON package</summary><pre>{JSON.stringify(log.data, null, 2)}</pre></details>}</Box>)}</Stack>
            </ScrollArea>
          )}
        </Stack>
      </Drawer>
    </Box>
  );
}
