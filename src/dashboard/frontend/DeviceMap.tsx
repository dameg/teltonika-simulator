import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { memo, useEffect, useMemo, useRef, type ReactElement } from "react";

import { colorForRevision, groupTracks, sampleTrackPositions, type TrackTrip } from "./map-tracks";

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

const ROUTE_LABEL_MIN_ZOOM = 14;
const MAX_RENDERED_POINTS_PER_SEGMENT = 800;
const MAX_HISTORY_POINT_MARKERS = 500;
const HISTORY_POINT_RADIUS = 5;
const SELECTED_HISTORY_POINT_RADIUS = 8;

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
  const fittedTracksRef = useRef("");
  const grouped = useMemo(
    () => groupTracks(positions, selectedImei),
    [positions, selectedImei],
  );
  const deviceByImei = useMemo(
    () => new Map(devices.map((device) => [device.imei, device])),
    [devices],
  );
  const revisionByKey = useMemo(
    () => new Map(configRevisions.map((revision) => [revisionKey(revision.imei, revision.configRevision), revision])),
    [configRevisions],
  );
  const fitKey = variant === "history"
    ? `${selectedImei}\u0000${grouped.trips.map((trip) => trip.key).join("\u0001")}\u0000${positions[0]?.timestampMs ?? ""}\u0000${positions.at(-1)?.timestampMs ?? ""}`
    : `${selectedImei}\u0000${grouped.trips.map((trip) => trip.key).join("\u0001")}`;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current).setView([54.6872, 25.2797], 14);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    layersRef.current = {
      markers: L.layerGroup().addTo(map),
      tracks: L.layerGroup().addTo(map),
      labels: L.layerGroup(),
    };
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = undefined;
      layersRef.current = undefined;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layers = layersRef.current;
    if (!map || !layers) return;

    layers.markers.clearLayers();
    layers.tracks.clearLayers();
    layers.labels.clearLayers();

    if (variant === "live") {
      const latest = new Map<string, MapPosition>();
      for (const position of positions) latest.set(position.imei, position);
      for (const [imei, position] of latest) {
        const device = deviceByImei.get(imei);
        L.circleMarker([position.latitude, position.longitude], {
          radius: imei === selectedImei ? 9 : 7,
          color: device?.status === "running" ? "#167d6b" : "#64748b",
          fillOpacity: 0.9,
        })
          .bindPopup(`<strong>${escapeHtml(device?.label ?? imei)}</strong><br>${escapeHtml(imei)}<br>${position.speedKph} km/h · ${position.satellites} sat.<br>${position.altitudeMeters} m · ${position.headingDegrees}&deg;`)
          .addTo(layers.markers);
      }
    } else {
      const sampled = [...sampleTrackPositions(positions, MAX_HISTORY_POINT_MARKERS)];
      const selected = selectedPositionId
        ? positions.find((position) => position.id === selectedPositionId)
        : undefined;
      if (selected && !sampled.includes(selected)) sampled.push(selected);

      for (const position of sampled) {
        const isSelected = position.id === selectedPositionId;
        const marker = L.circleMarker([position.latitude, position.longitude], {
          radius: isSelected ? SELECTED_HISTORY_POINT_RADIUS : HISTORY_POINT_RADIUS,
          color: isSelected ? "#172033" : "#0b4a7d",
          fillColor: isSelected ? "#f59f00" : "#ffffff",
          fillOpacity: 1,
          weight: isSelected ? 3 : 2,
        }).bindTooltip(`${formatDateTime(position.timestampMs)} · ${position.speedKph} km/h`);
        if (onSelectPosition) marker.on("click", () => onSelectPosition(position));
        marker.addTo(layers.markers);
      }
    }

    for (const segment of grouped.segments) {
      if (segment.positions.length < 2) continue;
      const latLngs = sampleTrackPositions(segment.positions, MAX_RENDERED_POINTS_PER_SEGMENT).map(
        (position) => [position.latitude, position.longitude] as L.LatLngTuple,
      );
      L.polyline(latLngs, { color: "#ffffff", weight: 9, opacity: 0.9 }).addTo(layers.tracks);
      L.polyline(latLngs, {
        color: colorForRevision(segment.imei, segment.configRevision),
        weight: 5,
      }).addTo(layers.tracks);
    }

    // Track polylines are added after the point markers and would otherwise cover them.
    layers.markers.eachLayer((layer) => {
      if (layer instanceof L.Path) layer.bringToFront();
    });

    if (variant === "live") {
      for (const trip of grouped.trips) {
        const device = deviceByImei.get(trip.imei);
        L.circleMarker([trip.labelPosition.latitude, trip.labelPosition.longitude], {
          radius: 0,
          opacity: 0,
          fillOpacity: 0,
          interactive: false,
        })
          .bindTooltip(`${device?.label ?? trip.imei} · ${trip.imei}`, {
            permanent: true,
            direction: "center",
            className: "route-device-label",
          })
          .addTo(layers.labels);
      }
    }

    const syncLabels = () => {
      if (map.getZoom() >= ROUTE_LABEL_MIN_ZOOM) {
        if (!map.hasLayer(layers.labels)) layers.labels.addTo(map);
      } else if (map.hasLayer(layers.labels)) {
        layers.labels.removeFrom(map);
      }
    };
    if (variant === "live") {
      syncLabels();
      map.on("zoomend", syncLabels);
    }

    const bounds = L.latLngBounds([]);
    for (const trip of grouped.trips) {
      for (const position of trip.positions) bounds.extend([position.latitude, position.longitude]);
    }
    if (bounds.isValid() && fittedTracksRef.current !== fitKey) {
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 16 });
      fittedTracksRef.current = fitKey;
    }

    return () => {
      if (variant === "live") map.off("zoomend", syncLabels);
    };
  }, [deviceByImei, fitKey, grouped, onSelectPosition, positions, selectedImei, selectedPositionId, variant]);

  return (
    <div className="map-widget">
      <div
        ref={containerRef}
        className={`map-canvas${variant === "history" ? " map-canvas-history" : ""}`}
        aria-label={variant === "history" ? "Historical trip map" : "Device positions map"}
      />
      {variant === "live" && grouped.trips.length > 0 ? (
        <MapLegend trips={grouped.trips} devices={deviceByImei} revisions={revisionByKey} />
      ) : null}
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

interface MapLegendProps {
  trips: TrackTrip<MapPosition>[];
  devices: ReadonlyMap<string, MapDevice>;
  revisions: ReadonlyMap<string, MapConfigRevision>;
}

const MapLegend = memo(function MapLegend({ trips, devices, revisions }: MapLegendProps): ReactElement {
  return (
    <div className="map-legend" aria-label="Route configuration legend">
      <div className="map-legend-title">Route configuration</div>
      {trips.map((trip) => (
        <div key={trip.key} className="map-legend-trip">
          <div className="map-legend-device">
            {devices.get(trip.imei)?.label ?? trip.imei} · trip {shortTripId(trip.tripId)}
          </div>
          {trip.segments.map((segment) => {
            const revision = revisions.get(revisionKey(segment.imei, segment.configRevision));
            return (
              <div
                key={segment.key}
                className="map-legend-revision"
                title={revision ? JSON.stringify(revision.config, null, 2) : undefined}
              >
                <span
                  className="map-legend-swatch"
                  style={{ backgroundColor: colorForRevision(segment.imei, segment.configRevision) }}
                />
                <span>
                  <strong>Rev {segment.configRevision}</strong>
                  {revision ? ` · ${formatTime(revision.createdAtMs)} · ${configSummary(revision.config)}` : ""}
                  {revision?.changedFields.length ? ` · changed: ${revision.changedFields.join(", ")}` : ""}
                </span>
              </div>
            );
          })}
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
