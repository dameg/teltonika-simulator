import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildRouteGeometry,
  generatedTelemetryFallbackRoute,
  interpolateRoutePosition,
  interpolateRouteProgress,
  loadRouteFromFile,
  parseRouteDefinition,
  resolveSimulationRoute
} from "../src";

const fixturesDir = join(__dirname, "fixtures");

describe("route loading", () => {
  it("loads valid JSON routes deterministically", () => {
    const route = loadRouteFromFile(join(fixturesDir, "city-loop.route.json"));

    expect(route).toEqual({
      metadata: {
        id: "city-loop",
        name: "City loop",
        description: "Small deterministic test route"
      },
      points: [
        { latitude: 54.6872, longitude: 25.2797, altitudeMeters: 120, speedLimitKph: 50 },
        { latitude: 54.688, longitude: 25.281, altitudeMeters: 121, speedLimitKph: 30, stopDurationMs: 15000 },
        { latitude: 54.6891, longitude: 25.2824, altitudeMeters: 119, speedLimitKph: 40 }
      ]
    });
  });

  it("preserves route point order", () => {
    const route = loadRouteFromFile(join(fixturesDir, "city-loop.route.json"));

    expect(route.points.map((point) => point.latitude)).toEqual([54.6872, 54.688, 54.6891]);
  });

  it("loads the reusable Krakow-Berlin road route", () => {
    const route = loadRouteFromFile(join(__dirname, "..", "routes", "krakow-berlin.route.json"));
    const oneWayDistanceMeters = buildRouteGeometry(route).segments.slice(0, -1).reduce((sum, segment) => sum + segment.distanceMeters, 0);

    expect(route.points).toHaveLength(1_383);
    expect(route.points[0]).toMatchObject({ latitude: 50.049649, longitude: 19.944352 });
    expect(route.points.at(-1)).toMatchObject({ latitude: 52.520001, longitude: 13.404964 });
    expect(oneWayDistanceMeters).toBeGreaterThan(600_000);
    expect(oneWayDistanceMeters).toBeLessThan(610_000);
  });

  it("loads the reusable Munich-Rome road route", () => {
    const route = loadRouteFromFile(join(__dirname, "..", "routes", "munich-rome.route.json"));
    const oneWayDistanceMeters = buildRouteGeometry(route).segments.slice(0, -1).reduce((sum, segment) => sum + segment.distanceMeters, 0);

    expect(route.points).toHaveLength(2_206);
    expect(route.points[0]).toMatchObject({ latitude: 48.136651, longitude: 11.577253 });
    expect(route.points.at(-1)).toMatchObject({ latitude: 41.902866, longitude: 12.496497 });
    expect(oneWayDistanceMeters).toBeGreaterThan(910_000);
    expect(oneWayDistanceMeters).toBeLessThan(920_000);
  });

  it("fails clearly for invalid JSON", () => {
    expect(() => loadRouteFromFile(join(fixturesDir, "invalid-json.route.json"))).toThrow(/Invalid route JSON/);
  });

  it("uses the generated fallback route when no route file is supplied", () => {
    expect(resolveSimulationRoute(undefined)).toEqual(generatedTelemetryFallbackRoute);
  });

  it("prefers an explicit route file over the generated fallback", () => {
    const explicitRoute = loadRouteFromFile(join(fixturesDir, "city-loop.route.json"));

    expect(resolveSimulationRoute(join(fixturesDir, "city-loop.route.json"))).toEqual(explicitRoute);
    expect(resolveSimulationRoute(join(fixturesDir, "city-loop.route.json"))).not.toEqual(generatedTelemetryFallbackRoute);
  });

  it("treats an empty route path as an invalid explicit route file", () => {
    expect(() => resolveSimulationRoute("")).toThrow(/Unable to read route file/);
  });

  it("fails clearly for empty routes, invalid coordinates, and malformed speed limits", () => {
    expect(() => parseRouteDefinition({ metadata: { id: "empty" }, points: [] })).toThrow("route.points must be a non-empty array");
    expect(() => parseRouteDefinition({ metadata: { id: "bad-lat" }, points: [{ latitude: 91, longitude: 25 }] })).toThrow(
      "route.points[0].latitude must be between -90 and 90"
    );
    expect(() =>
      parseRouteDefinition({ metadata: { id: "bad-speed" }, points: [{ latitude: 54, longitude: 25, speedLimitKph: 0 }] })
    ).toThrow("route.points[0].speedLimitKph must be greater than 0");
  });

  it("validates optional altitude and stop hints", () => {
    expect(() =>
      parseRouteDefinition({ metadata: { id: "bad-altitude" }, points: [{ latitude: 54, longitude: 25, altitudeMeters: Number.NaN }] })
    ).toThrow("route.points[0].altitudeMeters must be a finite number");
    expect(() =>
      parseRouteDefinition({ metadata: { id: "bad-stop" }, points: [{ latitude: 54, longitude: 25, stopDurationMs: -1 }] })
    ).toThrow("route.points[0].stopDurationMs must be a non-negative integer");
  });

  it("keeps route loading independent from TCP and packet encoding modules", () => {
    const source = readFileSync("src/route.ts", "utf8");

    expect(source).not.toMatch(/^\s*import .*["'](?:node:net|net)["']/m);
    expect(source).not.toMatch(/^\s*import .*["'].*(?:codec|packet|encoder).*["']/im);
  });

  it("computes route segment distances, headings, and cumulative distance", () => {
    const geometry = buildRouteGeometry({
      metadata: { id: "square" },
      points: [
        { latitude: 0, longitude: 0, altitudeMeters: 10, speedLimitKph: 50 },
        { latitude: 0, longitude: 0.001, altitudeMeters: 20, speedLimitKph: 30 },
        { latitude: 0.001, longitude: 0.001, altitudeMeters: 30, speedLimitKph: 40 }
      ]
    });

    expect(geometry.segments).toHaveLength(3);
    expect(geometry.segments[0]?.distanceMeters).toBeCloseTo(111.19, 1);
    expect(geometry.segments[0]?.startDistanceMeters).toBe(0);
    expect(geometry.segments[1]?.startDistanceMeters).toBeCloseTo(111.19, 1);
    expect(geometry.segments[0]?.headingDegrees).toBeCloseTo(90, 5);
    expect(geometry.segments[1]?.headingDegrees).toBeCloseTo(0, 5);
    expect(geometry.totalDistanceMeters).toBeGreaterThan(300);
  });

  it("interpolates smooth positions, altitude, heading, and speed limit inputs", () => {
    const geometry = buildRouteGeometry({
      metadata: { id: "line" },
      points: [
        { latitude: 0, longitude: 0, altitudeMeters: 10, speedLimitKph: 50 },
        { latitude: 0, longitude: 0.001, altitudeMeters: 20, speedLimitKph: 30 }
      ]
    });

    const midpoint = interpolateRouteProgress(geometry, 0.25);

    expect(midpoint.latitude).toBeCloseTo(0, 8);
    expect(midpoint.longitude).toBeCloseTo(0.0005, 8);
    expect(midpoint.altitudeMeters).toBeCloseTo(15, 8);
    expect(midpoint.headingDegrees).toBeCloseTo(90, 5);
    expect(midpoint.speedLimitKph).toBe(50);
  });

  it("loops to the first point deterministically at route end", () => {
    const route = loadRouteFromFile(join(fixturesDir, "city-loop.route.json"));
    const geometry = buildRouteGeometry(route);

    const start = interpolateRoutePosition(geometry, 0);
    const looped = interpolateRoutePosition(geometry, geometry.totalDistanceMeters);

    expect(looped.latitude).toBeCloseTo(start.latitude, 8);
    expect(looped.longitude).toBeCloseTo(start.longitude, 8);
    expect(looped.segmentIndex).toBe(0);
  });
});
