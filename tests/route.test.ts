import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { loadRouteFromFile, parseRouteDefinition } from "../src";

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

  it("fails clearly for invalid JSON", () => {
    expect(() => loadRouteFromFile(join(fixturesDir, "invalid-json.route.json"))).toThrow(/Invalid route JSON/);
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
});
