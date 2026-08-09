import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { memo, useEffect, useMemo, useRef, type ReactElement } from "react";

import { colorForRevision, groupTracks, type TrackTrip } from "./map-tracks";

export interface MapDevice {
  imei: string;
  label: string;
  status: string;
}

export interface MapPosition {
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
}

interface MapLayers {
  markers: L.LayerGroup;
  tracks: L.LayerGroup;
  labels: L.LayerGroup;
}

const ROUTE_LABEL_MIN_ZOOM = 14;

export const DeviceMap = memo(function DeviceMap({
  devices,
  positions,
  configRevisions,
  selectedImei,
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
  const fitKey = `${selectedImei}\u0000${grouped.trips.map((trip) => trip.key).join("\u0001")}`;

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

    for (const segment of grouped.segments) {
      if (segment.positions.length < 2) continue;
      const latLngs = segment.positions.map(
        (position) => [position.latitude, position.longitude] as L.LatLngTuple,
      );
      L.polyline(latLngs, { color: "#ffffff", weight: 9, opacity: 0.9 }).addTo(layers.tracks);
      L.polyline(latLngs, {
        color: colorForRevision(segment.imei, segment.configRevision),
        weight: 5,
      }).addTo(layers.tracks);
    }

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

    const syncLabels = () => {
      if (map.getZoom() >= ROUTE_LABEL_MIN_ZOOM) {
        if (!map.hasLayer(layers.labels)) layers.labels.addTo(map);
      } else if (map.hasLayer(layers.labels)) {
        layers.labels.removeFrom(map);
      }
    };
    syncLabels();
    map.on("zoomend", syncLabels);

    const bounds = L.latLngBounds([]);
    for (const trip of grouped.trips) {
      for (const position of trip.positions) bounds.extend([position.latitude, position.longitude]);
    }
    if (bounds.isValid() && fittedTracksRef.current !== fitKey) {
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 16 });
      fittedTracksRef.current = fitKey;
    }

    return () => {
      map.off("zoomend", syncLabels);
    };
  }, [deviceByImei, fitKey, grouped, positions, selectedImei]);

  return (
    <div className="map-widget">
      <div ref={containerRef} className="map-canvas" aria-label="Device positions map" />
      {grouped.trips.length > 0 ? (
        <MapLegend trips={grouped.trips} devices={deviceByImei} revisions={revisionByKey} />
      ) : null}
      {positions.length === 0 ? <p className="map-caption">Waiting for acknowledged GPS data…</p> : null}
      {grouped.pointCount > 0 ? (
        <p className="map-caption">{selectedImei ? "Route" : "Routes"}: {grouped.pointCount} acknowledged GPS points.</p>
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
