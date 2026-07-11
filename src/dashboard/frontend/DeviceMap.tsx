import { useEffect, useRef, type ReactElement } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { visibleTrackImeis } from "./map-tracks";

const trackColors = ["#2563eb", "#dc2626", "#7c3aed", "#ea580c", "#0891b2"];

export interface MapDevice {
  imei: string;
  label: string;
  status: string;
}

export interface MapPosition {
  imei: string;
  timestampMs: number;
  latitude: number;
  longitude: number;
  altitudeMeters: number;
  headingDegrees: number;
  speedKph: number;
  satellites: number;
}

interface DeviceMapProps {
  devices: MapDevice[];
  positions: MapPosition[];
  selectedImei: string;
}

export function DeviceMap({ devices, positions, selectedImei }: DeviceMapProps): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | undefined>(undefined);
  const layerRef = useRef<L.LayerGroup | undefined>(undefined);
  const fittedTracksRef = useRef("");
  const trackImeis = visibleTrackImeis(positions, selectedImei);
  const trackKey = trackImeis.join(",");
  const routePointCount = positions.filter((position) => trackImeis.includes(position.imei)).length;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current).setView([54.6872, 25.2797], 14);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = undefined;
      layerRef.current = undefined;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    const deviceByImei = new Map(devices.map((device) => [device.imei, device]));
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
        .addTo(layer);
    }

    const bounds = L.latLngBounds([]);
    for (const [index, imei] of trackImeis.entries()) {
      const track = positions.filter((position) => position.imei === imei);
      if (track.length < 2) continue;
      const latLngs = track.map((position) => [position.latitude, position.longitude] as L.LatLngTuple);
      L.polyline(latLngs, { color: "#ffffff", weight: 9, opacity: 0.9 }).addTo(layer);
      L.polyline(latLngs, { color: trackColors[index % trackColors.length], weight: 5 }).addTo(layer);
      bounds.extend(latLngs);
    }
    if (bounds.isValid() && fittedTracksRef.current !== trackKey) {
      map.fitBounds(bounds, { padding: [24, 24] });
      fittedTracksRef.current = trackKey;
    }
  }, [devices, positions, selectedImei, trackImeis, trackKey]);

  return (
    <div>
      <div ref={containerRef} aria-label="Device positions map" style={{ height: 480, borderRadius: 10 }} />
      {positions.length === 0 && <p style={{ color: "#667d78" }}>Waiting for acknowledged GPS data…</p>}
      {routePointCount > 0 && <p style={{ color: "#667d78" }}>{selectedImei ? "Route" : "Routes"}: {routePointCount} acknowledged GPS points.</p>}
    </div>
  );
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
