import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { memo, useEffect, useMemo, useRef, type ReactElement } from "react";

import {
  colorForRevision,
  groupTracks,
  sampleTrackPositions,
  sampleTrackSegmentsWithinBudget,
  trackGeometryPointBudget,
  type TrackSegment,
  type TrackTrip,
} from "./map-tracks";
import {
  reconcileLayerRegistry,
  reconcileSelectedKeys,
  samePositionCoordinates,
  samePositionGeometry,
  samePositionTelemetry,
} from "./map-layer-reconciler";

export interface MapDevice {
  imei: string;
  label: string;
  status: string;
}

export interface MapPosition {
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

export interface MapConfigRevision {
  imei: string;
  configRevision: number;
  createdAtMs: number;
  changedFields: string[];
  config: Record<string, boolean | number | string | undefined>;
}

interface DeviceMapProps {
  devices: MapDevice[];
  positions: MapPosition[];
  configRevisions: MapConfigRevision[];
  selectedImei: string;
  variant?: "live" | "history";
  selectedPositionId?: string;
  onSelectPosition?: (position: MapPosition) => void;
}

interface MapLayers {
  markers: L.LayerGroup;
  tracks: L.LayerGroup;
  labels: L.LayerGroup;
}

interface LiveMarkerEntry {
  marker: L.CircleMarker;
  position: MapPosition;
  device?: MapDevice;
  selected: boolean;
}

interface HistoryMarkerEntry {
  marker: L.CircleMarker;
  position: MapPosition;
  base: boolean;
  selected: boolean;
}

interface TrackLayerEntry {
  outline: L.Polyline;
  color: L.Polyline;
  positions: readonly MapPosition[];
  revisionColor: string;
}

interface LabelEntry {
  marker: L.CircleMarker;
  position: MapPosition;
  text: string;
}

interface GeometryModel {
  segments: readonly TrackSegment<MapPosition>[];
  variant: "live" | "history";
}

interface LegendTrip {
  key: string;
  deviceText: string;
  revisions: LegendRevision[];
}

interface LegendRevision {
  key: string;
  color: string;
  revision: number;
  details: string;
  title?: string;
}

const ROUTE_LABEL_MIN_ZOOM = 14;
const MAX_HISTORY_POINT_MARKERS = 500;
const HISTORY_POINT_RADIUS = 5;
const SELECTED_HISTORY_POINT_RADIUS = 8;
const DEFAULT_VIEW: L.LatLngTuple = [54.6872, 25.2797];

export const DeviceMap = memo(function DeviceMap({
  devices,
  positions,
  configRevisions,
  selectedImei,
  variant = "live",
  selectedPositionId,
  onSelectPosition,
}: DeviceMapProps): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | undefined>(undefined);
  const layersRef = useRef<MapLayers | undefined>(undefined);
  const liveMarkersRef = useRef(new Map<string, LiveMarkerEntry>());
  const historyMarkersRef = useRef(new Map<string, HistoryMarkerEntry>());
  const tracksRef = useRef(new Map<string, TrackLayerEntry>());
  const labelsRef = useRef(new Map<string, LabelEntry>());
  const interactionsRef = useRef(new Set<string>());
  const pendingGeometryRef = useRef<GeometryModel | undefined>(undefined);
  const geometryFrameRef = useRef<number | undefined>(undefined);
  const fittedFocusRef = useRef<string | undefined>(undefined);
  const selectedHistoryKeyRef = useRef<string | undefined>(undefined);
  const variantRef = useRef(variant);
  const onSelectPositionRef = useRef(onSelectPosition);
  const grouped = useMemo(() => groupTracks(positions, selectedImei), [positions, selectedImei]);
  const groupedRef = useRef(grouped);
  const deviceByImei = useMemo(() => new Map(devices.map((device) => [device.imei, device])), [devices]);
  const revisionByKey = useMemo(
    () => new Map(configRevisions.map((revision) => [revisionKey(revision.imei, revision.configRevision), revision])),
    [configRevisions],
  );

  groupedRef.current = grouped;
  variantRef.current = variant;
  onSelectPositionRef.current = onSelectPosition;

  const legend = useStableLegend(grouped.trips, deviceByImei, revisionByKey);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, { preferCanvas: true }).setView(DEFAULT_VIEW, 14);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    const layers: MapLayers = {
      markers: L.layerGroup().addTo(map),
      tracks: L.layerGroup().addTo(map),
      labels: L.layerGroup(),
    };
    mapRef.current = map;
    layersRef.current = layers;

    const syncLabels = () => {
      const visible = variantRef.current === "live" && map.getZoom() >= ROUTE_LABEL_MIN_ZOOM;
      if (visible && !map.hasLayer(layers.labels)) layers.labels.addTo(map);
      if (!visible && map.hasLayer(layers.labels)) layers.labels.removeFrom(map);
    };
    const beginInteraction = (event: L.LeafletEvent) => interactionsRef.current.add(event.type.replace("start", ""));
    const endInteraction = (event: L.LeafletEvent) => {
      interactionsRef.current.delete(event.type.replace("end", ""));
      if (interactionsRef.current.size === 0) scheduleGeometryReconciliation();
    };
    const handleZoomEnd = (event: L.LeafletEvent) => {
      syncLabels();
      endInteraction(event);
      pendingGeometryRef.current = geometryModel(groupedRef.current, variantRef.current);
      scheduleGeometryReconciliation();
    };

    map.on("movestart", beginInteraction);
    map.on("moveend", endInteraction);
    map.on("zoomstart", beginInteraction);
    map.on("zoomend", handleZoomEnd);
    syncLabels();

    return () => {
      if (geometryFrameRef.current !== undefined) cancelAnimationFrame(geometryFrameRef.current);
      map.off("movestart", beginInteraction);
      map.off("moveend", endInteraction);
      map.off("zoomstart", beginInteraction);
      map.off("zoomend", handleZoomEnd);
      map.remove();
      mapRef.current = undefined;
      layersRef.current = undefined;
      liveMarkersRef.current.clear();
      historyMarkersRef.current.clear();
      tracksRef.current.clear();
      labelsRef.current.clear();
      interactionsRef.current.clear();
    };

    function scheduleGeometryReconciliation(): void {
      if (interactionsRef.current.size > 0 || !pendingGeometryRef.current) return;
      if (geometryFrameRef.current !== undefined) cancelAnimationFrame(geometryFrameRef.current);
      geometryFrameRef.current = requestAnimationFrame(() => {
        geometryFrameRef.current = undefined;
        const model = pendingGeometryRef.current;
        pendingGeometryRef.current = undefined;
        if (model) reconcileTracks(map, layers, tracksRef.current, model);
      });
    }
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layers = layersRef.current;
    if (!map || !layers) return;

    if (variant === "live") {
      removeHistoryMarkers(layers, historyMarkersRef.current);
      reconcileLiveMarkers(layers, liveMarkersRef.current, positions, deviceByImei, selectedImei);
    } else {
      removeLiveMarkers(layers, liveMarkersRef.current);
      reconcileHistoryBaseMarkers(layers, historyMarkersRef.current, positions, onSelectPositionRef);
    }
  }, [deviceByImei, positions, selectedImei, variant]);

  useEffect(() => {
    if (variant !== "history") {
      selectedHistoryKeyRef.current = undefined;
      return;
    }
    const layers = layersRef.current;
    if (!layers) return;

    const next = selectedPositionId
      ? positions.find((position) => position.id === selectedPositionId)
      : undefined;
    const nextKey = next ? positionKey(next) : undefined;
    const previousKey = selectedHistoryKeyRef.current;
    reconcileSelectedKeys(
      previousKey,
      nextKey,
      (key) => unselectHistoryMarker(layers, historyMarkersRef.current, key),
      () => { if (next) selectHistoryMarker(layers, historyMarkersRef.current, next, onSelectPositionRef); },
    );
    selectedHistoryKeyRef.current = nextKey;
  }, [positions, selectedPositionId, variant]);

  useEffect(() => {
    pendingGeometryRef.current = geometryModel(grouped, variant);
    if (interactionsRef.current.size > 0) return;
    if (geometryFrameRef.current !== undefined) cancelAnimationFrame(geometryFrameRef.current);
    geometryFrameRef.current = requestAnimationFrame(() => {
      geometryFrameRef.current = undefined;
      const map = mapRef.current;
      const layers = layersRef.current;
      const model = pendingGeometryRef.current;
      pendingGeometryRef.current = undefined;
      if (map && layers && model) reconcileTracks(map, layers, tracksRef.current, model);
    });
  }, [grouped, variant]);

  useEffect(() => {
    const map = mapRef.current;
    const layers = layersRef.current;
    if (!map || !layers) return;

    if (variant === "live") reconcileLabels(layers, labelsRef.current, grouped.trips, deviceByImei);
    else removeLabels(layers, labelsRef.current);

    const visible = variant === "live" && map.getZoom() >= ROUTE_LABEL_MIN_ZOOM;
    if (visible && !map.hasLayer(layers.labels)) layers.labels.addTo(map);
    if (!visible && map.hasLayer(layers.labels)) layers.labels.removeFrom(map);
  }, [deviceByImei, grouped.trips, variant]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const tripFocus = variant === "history" ? grouped.trips.map((trip) => trip.key).join("\u0001") : "";
    const focusKey = `${variant}\u0000${selectedImei}\u0000${tripFocus}`;
    if (fittedFocusRef.current === focusKey) return;

    const bounds = L.latLngBounds([]);
    for (const trip of grouped.trips) {
      for (const position of trip.positions) bounds.extend([position.latitude, position.longitude]);
    }
    if (!bounds.isValid()) return;
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 16 });
    fittedFocusRef.current = focusKey;
  }, [grouped.trips, selectedImei, variant]);

  return (
    <div className="map-widget">
      <div
        ref={containerRef}
        className={`map-canvas${variant === "history" ? " map-canvas-history" : ""}`}
        aria-label={variant === "history" ? "Historical trip map" : "Device positions map"}
      />
      {variant === "live" && legend.length > 0 ? <MapLegend trips={legend} /> : null}
      {positions.length === 0 ? (
        <p className="map-caption">
          {variant === "history" ? "Select a trip to view its stored route." : "Waiting for acknowledged GPS data…"}
        </p>
      ) : null}
      {grouped.pointCount > 0 ? (
        <p className="map-caption">
          {variant === "history" ? "Stored route" : selectedImei ? "Route" : "Routes"}: {grouped.pointCount} GPS points
          {variant === "history" ? " · select a point for telemetry." : "."}
        </p>
      ) : null}
    </div>
  );
}, areDeviceMapPropsEqual);

function geometryModel(
  grouped: ReturnType<typeof groupTracks<MapPosition>>,
  variant: "live" | "history",
): GeometryModel {
  return { segments: grouped.segments, variant };
}

function reconcileTracks(
  map: L.Map,
  layers: MapLayers,
  registry: Map<string, TrackLayerEntry>,
  model: GeometryModel,
): void {
  const budget = trackGeometryPointBudget(model.variant, map.getZoom());
  const sampled = sampleTrackSegmentsWithinBudget(model.segments, budget);
  const renderableSegments = sampled.segments.filter((segment) => segment.positions.length >= 2);
  reconcileLayerRegistry(registry, renderableSegments, {
    key: (segment) => segment.key,
    create: (segment) => {
      const revisionColor = colorForRevision(segment.imei, segment.configRevision);
      const latLngs = toLatLngs(segment.positions);
      const outline = L.polyline(latLngs, { color: "#ffffff", weight: 9, opacity: 0.9 }).addTo(layers.tracks);
      const color = L.polyline(latLngs, { color: revisionColor, weight: 5 }).addTo(layers.tracks);
      return { outline, color, positions: segment.positions, revisionColor };
    },
    update: (existing, segment) => {
      let changed = false;
      if (!samePositionGeometry(existing.positions, segment.positions)) {
        const latLngs = toLatLngs(segment.positions);
        existing.outline.setLatLngs(latLngs);
        existing.color.setLatLngs(latLngs);
        existing.positions = segment.positions;
        changed = true;
      }
      const revisionColor = colorForRevision(segment.imei, segment.configRevision);
      if (existing.revisionColor !== revisionColor) {
        existing.color.setStyle({ color: revisionColor });
        existing.revisionColor = revisionColor;
        changed = true;
      }
      return changed;
    },
    remove: (entry) => {
      layers.tracks.removeLayer(entry.outline);
      layers.tracks.removeLayer(entry.color);
    },
  });

  // Canvas paths share a renderer, so route updates must not cover selectable point markers.
  layers.markers.eachLayer((layer) => {
    if (layer instanceof L.Path) layer.bringToFront();
  });
}

function reconcileLiveMarkers(
  layers: MapLayers,
  registry: Map<string, LiveMarkerEntry>,
  positions: readonly MapPosition[],
  devices: ReadonlyMap<string, MapDevice>,
  selectedImei: string,
): void {
  const latest = new Map<string, MapPosition>();
  for (const position of positions) latest.set(position.imei, position);

  for (const [imei, position] of latest) {
    const device = devices.get(imei);
    const selected = imei === selectedImei;
    const existing = registry.get(imei);
    if (!existing) {
      const marker = L.circleMarker([position.latitude, position.longitude], liveMarkerStyle(device, selected))
        .bindPopup(livePopup(position, device))
        .addTo(layers.markers);
      registry.set(imei, { marker, position, device, selected });
      continue;
    }
    if (!samePositionCoordinates(existing.position, position)) existing.marker.setLatLng([position.latitude, position.longitude]);
    if (existing.selected !== selected || existing.device?.status !== device?.status) {
      existing.marker.setStyle(liveMarkerStyle(device, selected));
    }
    if (!samePositionTelemetry(existing.position, position) || existing.device?.label !== device?.label) {
      existing.marker.setPopupContent(livePopup(position, device));
    }
    existing.position = position;
    existing.device = device;
    existing.selected = selected;
  }

  for (const [imei, entry] of registry) {
    if (latest.has(imei)) continue;
    layers.markers.removeLayer(entry.marker);
    registry.delete(imei);
  }
}

function reconcileHistoryBaseMarkers(
  layers: MapLayers,
  registry: Map<string, HistoryMarkerEntry>,
  positions: readonly MapPosition[],
  selectRef: { current: DeviceMapProps["onSelectPosition"] },
): void {
  const sampled = sampleTrackPositions(positions, MAX_HISTORY_POINT_MARKERS);
  const baseKeys = new Set(sampled.map(positionKey));
  for (const entry of registry.values()) entry.base = false;

  for (const position of sampled) {
    const key = positionKey(position);
    const existing = registry.get(key);
    if (existing) {
      existing.base = true;
      if (!samePositionCoordinates(existing.position, position)) existing.marker.setLatLng([position.latitude, position.longitude]);
      if (!samePositionTelemetry(existing.position, position)) existing.marker.setTooltipContent(historyTooltip(position));
      existing.position = position;
      continue;
    }
    registry.set(key, createHistoryMarker(layers, position, true, false, selectRef));
  }

  for (const [key, entry] of registry) {
    if (baseKeys.has(key) || entry.selected) continue;
    layers.markers.removeLayer(entry.marker);
    registry.delete(key);
  }
}

function createHistoryMarker(
  layers: MapLayers,
  position: MapPosition,
  base: boolean,
  selected: boolean,
  selectRef: { current: DeviceMapProps["onSelectPosition"] },
): HistoryMarkerEntry {
  const entry = {} as HistoryMarkerEntry;
  const marker = L.circleMarker([position.latitude, position.longitude], historyMarkerStyle(selected))
    .bindTooltip(historyTooltip(position));
  entry.marker = marker;
  entry.position = position;
  entry.base = base;
  entry.selected = selected;
  marker.on("click", () => selectRef.current?.(entry.position));
  marker.addTo(layers.markers);
  return entry;
}

function selectHistoryMarker(
  layers: MapLayers,
  registry: Map<string, HistoryMarkerEntry>,
  position: MapPosition,
  selectRef: { current: DeviceMapProps["onSelectPosition"] },
): void {
  const key = positionKey(position);
  let entry = registry.get(key);
  if (!entry) {
    entry = createHistoryMarker(layers, position, false, true, selectRef);
    registry.set(key, entry);
    return;
  }
  if (!entry.selected) entry.marker.setStyle(historyMarkerStyle(true));
  entry.selected = true;
}

function unselectHistoryMarker(
  layers: MapLayers,
  registry: Map<string, HistoryMarkerEntry>,
  key: string,
): void {
  const entry = registry.get(key);
  if (!entry) return;
  entry.selected = false;
  if (entry.base) entry.marker.setStyle(historyMarkerStyle(false));
  else {
    layers.markers.removeLayer(entry.marker);
    registry.delete(key);
  }
}

function reconcileLabels(
  layers: MapLayers,
  registry: Map<string, LabelEntry>,
  trips: readonly TrackTrip<MapPosition>[],
  devices: ReadonlyMap<string, MapDevice>,
): void {
  const seen = new Set<string>();
  for (const trip of trips) {
    seen.add(trip.key);
    const position = trip.labelPosition;
    const text = `${devices.get(trip.imei)?.label ?? trip.imei} · ${trip.imei}`;
    const existing = registry.get(trip.key);
    if (existing) {
      if (!samePositionCoordinates(existing.position, position)) existing.marker.setLatLng([position.latitude, position.longitude]);
      if (existing.text !== text) existing.marker.setTooltipContent(text);
      existing.position = position;
      existing.text = text;
      continue;
    }
    const marker = L.circleMarker([position.latitude, position.longitude], {
      radius: 0,
      opacity: 0,
      fillOpacity: 0,
      interactive: false,
    })
      .bindTooltip(text, { permanent: true, direction: "center", className: "route-device-label" })
      .addTo(layers.labels);
    registry.set(trip.key, { marker, position, text });
  }
  for (const [key, entry] of registry) {
    if (seen.has(key)) continue;
    layers.labels.removeLayer(entry.marker);
    registry.delete(key);
  }
}

function removeLiveMarkers(layers: MapLayers, registry: Map<string, LiveMarkerEntry>): void {
  for (const entry of registry.values()) layers.markers.removeLayer(entry.marker);
  registry.clear();
}

function removeHistoryMarkers(layers: MapLayers, registry: Map<string, HistoryMarkerEntry>): void {
  for (const entry of registry.values()) layers.markers.removeLayer(entry.marker);
  registry.clear();
}

function removeLabels(layers: MapLayers, registry: Map<string, LabelEntry>): void {
  for (const entry of registry.values()) layers.labels.removeLayer(entry.marker);
  registry.clear();
}

function liveMarkerStyle(device: MapDevice | undefined, selected: boolean): L.CircleMarkerOptions {
  return {
    radius: selected ? 9 : 7,
    color: device?.status === "running" ? "#167d6b" : "#64748b",
    fillOpacity: 0.9,
  };
}

function historyMarkerStyle(selected: boolean): L.CircleMarkerOptions {
  return {
    radius: selected ? SELECTED_HISTORY_POINT_RADIUS : HISTORY_POINT_RADIUS,
    color: selected ? "#102832" : "#087f8c",
    fillColor: selected ? "#f28c28" : "#ffffff",
    fillOpacity: 1,
    weight: selected ? 3 : 2,
  };
}

function livePopup(position: MapPosition, device?: MapDevice): string {
  return `<strong>${escapeHtml(device?.label ?? position.imei)}</strong><br>${escapeHtml(position.imei)}<br>${position.speedKph} km/h · ${position.satellites} sat.<br>${position.altitudeMeters} m · ${position.headingDegrees}&deg;`;
}

function historyTooltip(position: MapPosition): string {
  return `${formatDateTime(position.timestampMs)} · ${position.speedKph} km/h`;
}

function toLatLngs(positions: readonly MapPosition[]): L.LatLngTuple[] {
  return positions.map((position) => [position.latitude, position.longitude]);
}

function positionKey(position: MapPosition): string {
  return position.id ?? `${position.imei}\u0000${position.tripId}\u0000${position.timestampMs}`;
}

function useStableLegend(
  trips: readonly TrackTrip<MapPosition>[],
  devices: ReadonlyMap<string, MapDevice>,
  revisions: ReadonlyMap<string, MapConfigRevision>,
): readonly LegendTrip[] {
  const previousRef = useRef<{ signature: string; trips: readonly LegendTrip[] } | undefined>(undefined);
  return useMemo(() => {
    const model = buildLegend(trips, devices, revisions);
    const signature = JSON.stringify(model);
    if (previousRef.current?.signature === signature) return previousRef.current.trips;
    previousRef.current = { signature, trips: model };
    return model;
  }, [devices, revisions, trips]);
}

function buildLegend(
  trips: readonly TrackTrip<MapPosition>[],
  devices: ReadonlyMap<string, MapDevice>,
  revisions: ReadonlyMap<string, MapConfigRevision>,
): LegendTrip[] {
  return trips.map((trip) => ({
    key: trip.key,
    deviceText: `${devices.get(trip.imei)?.label ?? trip.imei} · trip ${shortTripId(trip.tripId)}`,
    revisions: trip.segments.map((segment) => {
      const revision = revisions.get(revisionKey(segment.imei, segment.configRevision));
      return {
        key: segment.key,
        color: colorForRevision(segment.imei, segment.configRevision),
        revision: segment.configRevision,
        details: revision
          ? ` · ${formatTime(revision.createdAtMs)} · ${configSummary(revision.config)}${revision.changedFields.length ? ` · changed: ${revision.changedFields.join(", ")}` : ""}`
          : "",
        title: revision ? JSON.stringify(revision.config, null, 2) : undefined,
      };
    }),
  }));
}

const MapLegend = memo(function MapLegend({ trips }: { trips: readonly LegendTrip[] }): ReactElement {
  return (
    <div className="map-legend" aria-label="Route configuration legend">
      <div className="map-legend-title">Route configuration</div>
      {trips.map((trip) => (
        <div key={trip.key} className="map-legend-trip">
          <div className="map-legend-device">{trip.deviceText}</div>
          {trip.revisions.map((revision) => (
            <div key={revision.key} className="map-legend-revision" title={revision.title}>
              <span className="map-legend-swatch" style={{ backgroundColor: revision.color }} />
              <span><strong>Rev {revision.revision}</strong>{revision.details}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
});

function revisionKey(imei: string, revision: number): string {
  return `${imei}\u0000${revision}`;
}

function areDeviceMapPropsEqual(previous: DeviceMapProps, next: DeviceMapProps): boolean {
  if (
    previous.positions !== next.positions
    || previous.configRevisions !== next.configRevisions
    || previous.selectedImei !== next.selectedImei
    || previous.variant !== next.variant
    || previous.selectedPositionId !== next.selectedPositionId
    || previous.onSelectPosition !== next.onSelectPosition
    || previous.devices.length !== next.devices.length
  ) return false;
  for (let index = 0; index < previous.devices.length; index += 1) {
    const left = previous.devices[index]!;
    const right = next.devices[index]!;
    if (left.imei !== right.imei || left.label !== right.label || left.status !== right.status) return false;
  }
  return true;
}

function shortTripId(tripId: string): string {
  return tripId.length > 8 ? tripId.slice(0, 8) : tripId;
}

function formatTime(value: number): string {
  return new Date(value).toLocaleTimeString();
}

function formatDateTime(value: number): string {
  return new Date(value).toLocaleString();
}

function configSummary(config: MapConfigRevision["config"]): string {
  const parts = [
    config.drivingStyle,
    config.deviceProfile,
    typeof config.intervalMs === "number" ? `${config.intervalMs} ms` : undefined,
    typeof config.simulationSpeed === "number" && config.simulationSpeed !== 0
      ? `speed ${config.simulationSpeed > 0 ? "+" : ""}${config.simulationSpeed}`
      : undefined,
  ];
  return parts.filter((part): part is string => Boolean(part)).join(" · ");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}
