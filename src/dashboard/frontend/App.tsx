import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactElement } from "react";
import { DeviceMap, type MapPosition } from "./DeviceMap";

type Status = "configured" | "starting" | "running" | "reconnecting" | "stopped" | "rejected" | "failed" | "completed";
type Severity = "debug" | "info" | "warn" | "error";
type DeviceConfig = { host: string; port: number; intervalMs: number; simulationSpeed: number; reconnectDelayMs: number; routeFile?: string; drivingStyle: string; seed: number; deviceProfile: string; packetCount?: number };
type Device = { imei: string; label: string; enabled: boolean; config: DeviceConfig };
type DeviceStatus = Device & { status: Status; updatedAtMs: number; lastStartAtMs?: number; lastStopAtMs?: number; lastError?: string };
type Overview = { total: number; counts: Record<Status, number> };
type LogEvent = { id: string; imei?: string; severity: Severity; type: string; message: string; timestampMs: number; data?: unknown };

const emptyConfig: DeviceConfig = { host: "127.0.0.1", port: 5027, intervalMs: 1000, simulationSpeed: 0, reconnectDelayMs: 3000, routeFile: "routes/krakow-berlin.route.json", drivingStyle: "normal", seed: 1, deviceProfile: "fmc650-fms", packetCount: 1_000 };
const emptyForm = { imei: "", label: "FMC650 test device", enabled: true, config: { ...emptyConfig } };
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
    const body = await response.json().catch(() => undefined) as { error?: { code?: string; message?: string } } | undefined;
    throw new Error(body?.error?.message ?? `${response.status} ${response.statusText}`);
  }
  return response.status === 204 ? (undefined as T) : response.json() as Promise<T>;
}

function numberValue(value: string): number | undefined {
  return value === "" ? undefined : Number(value);
}

function formatTime(value?: number): string {
  return value ? new Date(value).toLocaleTimeString() : "—";
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
  const [selectedImeis, setSelectedImeis] = useState<string[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [importText, setImportText] = useState("");
  const [severity, setSeverity] = useState("");
  const [eventType, setEventType] = useState("");
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
  const selectedStatus = selectedImei ? statusByImei.get(selectedImei) : undefined;
  const formStatus = form.imei ? statusByImei.get(form.imei) : undefined;
  const formActive = formStatus ? activeStatuses.has(formStatus.status) : false;
  const setActionBusy = (key: string, value: boolean) => setBusy((current) => ({ ...current, [key]: value }));
  const runAction = async (key: string, operation: () => Promise<unknown>) => {
    if (busy[key]) return;
    setActionBusy(key, true); setError("");
    try { await operation(); setMessage("Action accepted; status will refresh shortly."); await refresh(); }
    catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Action failed"); }
    finally { setActionBusy(key, false); }
  };

  const editDevice = (device: Device) => setForm({ imei: device.imei, label: device.label, enabled: device.enabled, config: { ...emptyConfig, ...device.config } });
  const submitDevice = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (!form.imei.trim() || !form.label.trim()) { setError("IMEI and label are required."); return; }
    const payload = { label: form.label, enabled: form.enabled, config: { ...form.config, routeFile: form.config.routeFile || undefined } };
    await runAction("save", async () => {
      if (devices.some((device) => device.imei === form.imei)) await request(`/api/devices/${encodeURIComponent(form.imei)}`, { method: "PATCH", body: JSON.stringify(payload) });
      else await request("/api/devices", { method: "POST", body: JSON.stringify({ imei: form.imei, ...payload }) });
      setForm({ ...emptyForm, config: { ...emptyConfig } });
    });
  };

  const changeConfig = (name: keyof DeviceConfig, value: string) => setForm((current) => ({ ...current, config: { ...current.config, [name]: ["port", "intervalMs", "simulationSpeed", "reconnectDelayMs", "seed", "packetCount"].includes(name) ? numberValue(value) : value } }));
  const toggleSelection = (imei: string) => setSelectedImeis((current) => current.includes(imei) ? current.filter((item) => item !== imei) : [...current, imei]);
  const clearState = () => { if (window.confirm("Clear devices, runtime history, and logs?")) void runAction("clear-state", async () => { await request("/api/status/state", { method: "DELETE" }); setSelectedImei(""); setSelectedImeis([]); setForm({ ...emptyForm, config: { ...emptyConfig } }); }); };
  const clearLogs = () => void runAction("clear-logs", () => request("/api/logs", { method: "DELETE" }));

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <header style={styles.header}>
          <div><p style={styles.kicker}>Operator control plane</p><h1 style={styles.title}>Teltonika Device Control</h1><p style={styles.subtitle}>Configure devices, launch simulator runs, and inspect their live lifecycle.</p></div>
          <div style={styles.headerActions}><button onClick={() => void refresh()}>Refresh now</button><button className="danger" onClick={clearState}>Clear dashboard state</button></div>
        </header>
        {message && <div role="status" style={styles.notice}>{message}</div>}
        {error && <div role="alert" style={styles.error}>{error}</div>}

        <section aria-label="Run overview" style={styles.cards}>
          {[["Total", overview.total], ["Configured", overview.counts.configured], ["Running", overview.counts.running + overview.counts.starting + overview.counts.reconnecting], ["Stopped", overview.counts.stopped], ["Failed", overview.counts.failed]].map(([label, value]) => <article key={label} style={styles.card}><span>{label}</span><strong>{value}</strong></article>)}
        </section>

        <div style={styles.columns}>
          <section style={styles.panel}><h2>Device setup</h2><form onSubmit={submitDevice}>
            <div style={styles.formGrid}><label>IMEI<span style={styles.inputRow}><input value={form.imei} disabled={Boolean(selectedDevice) || formActive} onChange={(event) => setForm({ ...form, imei: event.target.value })} placeholder="15 digits" /><button type="button" disabled={Boolean(selectedDevice) || formActive} onClick={() => setForm((current) => ({ ...current, imei: generateImei() }))}>Generate IMEI</button></span></label><label>Display name<input value={form.label} disabled={formActive} onChange={(event) => setForm({ ...form, label: event.target.value })} /></label></div>
            <label style={styles.checkbox}><input type="checkbox" checked={form.enabled} disabled={formActive} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} /> Enabled for start-all</label>
            <fieldset disabled={formActive}><legend>Simulator settings</legend><div style={styles.formGrid}>{([ ["host", "Parser host", "text"], ["port", "Parser port", "number"], ["intervalMs", "Interval (ms)", "number"], ["reconnectDelayMs", "Reconnect delay (ms)", "number"], ["drivingStyle", "Driving style", "text"], ["seed", "Seed", "number"], ["packetCount", "Packet limit", "number"]] as const).map(([name, label, type]) => <label key={name}>{label}<input type={type} value={form.config[name] ?? ""} onChange={(event) => changeConfig(name, event.target.value)} /></label>)}<label>Simulation speed: {form.config.simulationSpeed < 0 ? `${Math.abs(form.config.simulationSpeed)}× slower` : form.config.simulationSpeed > 0 ? `${form.config.simulationSpeed}× faster` : "real time"}<input type="range" min="-10" max="10" step="1" value={form.config.simulationSpeed} onChange={(event) => changeConfig("simulationSpeed", event.target.value)} /></label><label>Predefined route<select value={form.config.routeFile ?? ""} onChange={(event) => changeConfig("routeFile", event.target.value)}>{form.config.routeFile && !predefinedRoutes.some(([path]) => path === form.config.routeFile) && <option value={form.config.routeFile}>{form.config.routeFile} (custom)</option>}{predefinedRoutes.map(([path, label]) => <option key={path} value={path}>{label}</option>)}</select></label><label>Device profile<select value={form.config.deviceProfile} onChange={(event) => changeConfig("deviceProfile", event.target.value)}><option value="default-codec8e">Default Codec 8E</option><option value="fmc650-fms">FMC650 FMS/J1939</option></select></label></div></fieldset>
            <div style={styles.row}><button type="submit" disabled={busy.save || formActive}>{busy.save ? "Saving…" : selectedDevice ? "Save changes" : "Create device"}</button>{selectedDevice && <button type="button" disabled={formActive} onClick={() => { setSelectedImei(""); setForm({ ...emptyForm, config: { ...emptyConfig } }); }}>New device</button>}</div>
          </form><hr /><h3>Bulk import IMEIs</h3><p style={styles.help}>Paste newline- or comma-separated 15-digit IMEIs.</p><textarea value={importText} onChange={(event) => setImportText(event.target.value)} rows={4} placeholder="356307042441013\n356307042441014" /><button onClick={() => void runAction("import", async () => { await request("/api/devices/import", { method: "POST", body: JSON.stringify({ imeis: importText }) }); setImportText(""); })} disabled={!importText.trim() || busy.import}>Import devices</button></section>

          <section style={styles.panel}><div style={styles.sectionHeading}><h2>Runtime control</h2><div style={styles.row}><button onClick={() => void runAction("start-selected", () => request("/api/runtime/start-selected", { method: "POST", body: JSON.stringify({ imeis: selectedImeis }) }))} disabled={!selectedImeis.length || busy["start-selected"]}>Start selected</button><button onClick={() => void runAction("start-all", () => request("/api/runtime/start-all-enabled", { method: "POST" }))}>Start all enabled</button><button className="danger" onClick={() => void runAction("stop-all", () => request("/api/runtime/stop-all", { method: "POST" }))}>Stop all</button></div></div>
            {devices.length === 0 ? <p style={styles.empty}>No devices configured yet.</p> : <div style={styles.tableWrap}><table><thead><tr><th></th><th>Device</th><th>IMEI</th><th>Status</th><th>Last start</th><th>Action</th></tr></thead><tbody>{devices.map((device) => { const status = statusByImei.get(device.imei); const active = status ? activeStatuses.has(status.status) : false; return <tr key={device.imei} className={selectedImei === device.imei ? "selected" : ""}><td><input type="checkbox" checked={selectedImeis.includes(device.imei)} onChange={() => toggleSelection(device.imei)} aria-label={`Select ${device.label}`} /></td><td><button className="link" onClick={() => { setSelectedImei(device.imei); editDevice(device); }}>{device.label}</button></td><td>{device.imei}</td><td><span style={styles.badge}>{status?.status ?? "configured"}</span>{status?.lastError && <small style={styles.errorText}>{status.lastError}</small>}</td><td>{formatTime(status?.lastStartAtMs)}</td><td><button onClick={() => void runAction(device.imei, () => request(`/api/runtime/devices/${encodeURIComponent(device.imei)}/${active ? "stop" : "start"}`, { method: "POST" }))} disabled={active && busy[device.imei] || busy[device.imei]}>{busy[device.imei] ? "Working…" : actionLabel(status?.status ?? "configured")}</button><button className="link" onClick={() => void runAction(`delete-${device.imei}`, () => request(`/api/devices/${encodeURIComponent(device.imei)}`, { method: "DELETE" }))} disabled={active || busy[`delete-${device.imei}`]}>Delete</button></td></tr>; })}</tbody></table></div>}
          </section>
        </div>

        <section style={styles.panel}><div style={styles.sectionHeading}><div><p style={styles.kicker}>Selected device</p><h2>{selectedDevice?.label ?? "Run overview"}</h2></div>{selectedStatus && <div><strong style={styles.bigStatus}>{selectedStatus.status}</strong><p style={styles.help}>{selectedStatus.imei} · updated {formatTime(selectedStatus.updatedAtMs)}</p></div>}</div>{selectedDevice && <dl style={styles.details}><div><dt>Parser</dt><dd>{selectedDevice.config.host}:{selectedDevice.config.port}</dd></div><div><dt>Profile</dt><dd>{selectedDevice.config.deviceProfile}</dd></div><div><dt>Driving style</dt><dd>{selectedDevice.config.drivingStyle}</dd></div><div><dt>Last stop</dt><dd>{formatTime(selectedStatus?.lastStopAtMs)}</dd></div></dl>}</section>

        <section style={styles.panel}><div style={styles.sectionHeading}><div><p style={styles.kicker}>Live telemetry</p><h2>Device map</h2></div><p style={styles.help}>All routes are shown; select a device in the table to focus one.</p></div><DeviceMap devices={devices.map((device) => ({ ...device, status: statusByImei.get(device.imei)?.status ?? "configured" }))} positions={positions} selectedImei={selectedImei} /></section>

        <section style={styles.panel}><div style={styles.sectionHeading}><div><h2>Recent logs</h2><p style={styles.help}>Polling every second · newest 100 events</p></div><div style={styles.row}><select value={logImei} onChange={(event) => setLogImei(event.target.value)}><option value="">All devices</option>{devices.map((device) => <option key={device.imei} value={device.imei}>{device.label}</option>)}</select><select value={severity} onChange={(event) => setSeverity(event.target.value)}><option value="">All severities</option>{["debug", "info", "warn", "error"].map((item) => <option key={item}>{item}</option>)}</select><input value={eventType} onChange={(event) => setEventType(event.target.value)} placeholder="event type" /><button onClick={clearLogs}>Clear logs</button></div></div>{logs.length === 0 ? <p style={styles.empty}>No log events yet.</p> : <div style={styles.logList}>{[...logs].reverse().map((log) => <article key={log.id} style={styles.log}><time>{formatTime(log.timestampMs)}</time><span style={styles.badge}>{log.severity}</span><strong>{log.type}</strong><div><span>{log.message}</span>{log.data !== undefined && <details><summary>JSON package</summary><pre style={styles.jsonPreview}>{JSON.stringify(log.data, null, 2)}</pre></details>}</div></article>)}</div>}</section>
      </div>
    </main>
  );
}

const styles = {
  page: { background: "#eef2f1", color: "#172321", fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif", minHeight: "" + "100vh", padding: "28px 20px" },
  container: { margin: "0 auto", maxWidth: "1440px" }, header: { alignItems: "flex-end", display: "flex", gap: "24px", justifyContent: "space-between", marginBottom: "24px" }, headerActions: { display: "flex", gap: "8px", flexWrap: "wrap" as const, justifyContent: "flex-end" }, kicker: { color: "#367b72", fontSize: "11px", fontWeight: 800, letterSpacing: ".16em", margin: "0 0 7px", textTransform: "uppercase" as const }, title: { fontSize: "clamp(2rem, 5vw, 4rem)", letterSpacing: "-.06em", lineHeight: 1, margin: 0 }, subtitle: { color: "#56706b", margin: "12px 0 0", maxWidth: "58ch" }, cards: { display: "grid", gap: "12px", gridTemplateColumns: "repeat(5, minmax(100px, 1fr))", marginBottom: "16px" }, card: { background: "#fff", border: "1px solid #d7e2df", borderRadius: "12px", padding: "16px" }, columns: { display: "grid", gap: "16px", gridTemplateColumns: "minmax(350px, .8fr) minmax(600px, 1.7fr)", marginBottom: "16px" }, panel: { background: "#fff", border: "1px solid #d7e2df", borderRadius: "14px", marginBottom: "16px", padding: "20px" }, formGrid: { display: "grid", gap: "12px", gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }, inputRow: { alignItems: "center", display: "flex", gap: "8px" }, sectionHeading: { alignItems: "center", display: "flex", gap: "16px", justifyContent: "space-between", marginBottom: "16px" }, row: { alignItems: "center", display: "flex", flexWrap: "wrap" as const, gap: "8px" }, checkbox: { alignItems: "center", display: "flex", gap: "8px", margin: "14px 0" }, help: { color: "#667d78", fontSize: ".85rem", margin: "5px 0 12px" }, empty: { color: "#667d78", padding: "20px 0" }, badge: { background: "#e4f0ed", borderRadius: "999px", color: "#21675d", display: "inline-block", fontSize: ".75rem", fontWeight: 700, padding: "4px 8px" }, errorText: { color: "#a64038", display: "block", marginTop: "5px" }, notice: { background: "#e1f3ed", border: "1px solid #a9d9cc", borderRadius: "8px", marginBottom: "12px", padding: "10px 14px" }, error: { background: "#fff0ee", border: "1px solid #efb4ae", borderRadius: "8px", color: "#9b332b", marginBottom: "12px", padding: "10px 14px" }, tableWrap: { overflowX: "auto" as const }, details: { display: "grid", gap: "16px", gridTemplateColumns: "repeat(4, 1fr)", margin: 0 }, bigStatus: { color: "#28786d", textTransform: "uppercase" as const }, logList: { display: "grid", gap: "6px" }, log: { alignItems: "start", borderBottom: "1px solid #edf2f1", display: "grid", gap: "10px", gridTemplateColumns: "90px 60px 170px 1fr", padding: "9px 0" }, jsonPreview: { background: "#101917", borderRadius: "8px", color: "#d8f3e9", maxHeight: "360px", overflow: "auto", padding: "12px", whiteSpace: "pre-wrap" as const }
} as const;
