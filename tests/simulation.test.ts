import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  createDeterministicSimulationContext,
  createSeededRandom,
  createSimulationClock,
  createVehicleSimulator,
  loadRouteFromFile,
  resolveSimulationRoute,
  simulationDeterminismKey,
  simulationSpeedMultiplier
} from "../src";
import type { RouteDefinition } from "../src";

const fixturesDir = join(__dirname, "fixtures");
const route = {
  metadata: { id: "city-loop" },
  points: [
    { latitude: 54.6872, longitude: 25.2797 },
    { latitude: 54.688, longitude: 25.281 }
  ]
} satisfies RouteDefinition;

describe("deterministic simulation clock and randomness", () => {
  it("advances timestamps in milliseconds by the configured interval", () => {
    const clock = createSimulationClock({ startTimestampMs: 1_700_000_000_000, intervalMs: 500 });

    expect(clock.peek()).toBe(1_700_000_000_000);
    expect([clock.next(), clock.next(), clock.next()]).toEqual([1_700_000_000_000, 1_700_000_000_500, 1_700_000_001_000]);
    expect(clock.timestampAt(5)).toBe(1_700_000_002_500);
  });

  it("produces stable random sequences for the same seed", () => {
    const first = createSeededRandom(42);
    const second = createSeededRandom(42);

    expect([first.next(), first.next(), first.next()]).toEqual([second.next(), second.next(), second.next()]);
  });

  it("produces different random sequences for different seeds", () => {
    const first = createSeededRandom(42);
    const second = createSeededRandom(43);

    expect([first.next(), first.next(), first.next()]).not.toEqual([second.next(), second.next(), second.next()]);
  });

  it("uses route, style, seed, and interval for deterministic simulation contexts", () => {
    const options = { route, drivingStyle: "normal", seed: 7, startTimestampMs: 1_700_000_000_000, intervalMs: 1000 } as const;
    const first = createDeterministicSimulationContext(options);
    const second = createDeterministicSimulationContext(options);
    const differentStyle = createDeterministicSimulationContext({ ...options, drivingStyle: "eco" });

    expect(first.key).toBe("city-loop|normal|7|1000");
    expect(simulationDeterminismKey(options)).toBe(first.key);
    expect([first.clock.next(), first.clock.next(), first.random.next(), first.random.nextInt(1, 10)]).toEqual([
      second.clock.next(),
      second.clock.next(),
      second.random.next(),
      second.random.nextInt(1, 10)
    ]);
    expect(first.random.next()).not.toBe(differentStyle.random.next());
  });

  it("keeps simulation helpers independent from TCP and packet encoding modules", () => {
    const source = readFileSync("src/simulation.ts", "utf8");

    expect(source).not.toMatch(/^\s*import .*["'](?:node:net|net)["']/m);
    expect(source).not.toMatch(/^\s*import .*["'].*(?:codec|packet|encoder).*["']/im);
  });
});

describe("vehicle movement simulation", () => {
  it("scales simulation time from one tenth to ten times real time", () => {
    const baseOptions = { route, drivingStyle: "normal", seed: 7, startTimestampMs: 1_700_000_000_000, intervalMs: 1000 } as const;
    const slow = states(createVehicleSimulator({ ...baseOptions, simulationSpeed: -10 }), 2);
    const fast = states(createVehicleSimulator({ ...baseOptions, simulationSpeed: 10 }), 2);

    expect([simulationSpeedMultiplier(-10), simulationSpeedMultiplier(0), simulationSpeedMultiplier(10)]).toEqual([0.1, 1, 10]);
    expect((slow[1]?.timestampMs ?? 0) - (slow[0]?.timestampMs ?? 0)).toBe(100);
    expect((fast[1]?.timestampMs ?? 0) - (fast[0]?.timestampMs ?? 0)).toBe(10_000);
    expect(fast[1]?.tripDistanceMeters).toBeGreaterThan(slow[1]?.tripDistanceMeters ?? Number.POSITIVE_INFINITY);
    expect(() => simulationSpeedMultiplier(11)).toThrow("between -10 and 10");
  });

  it("produces the same vehicle-state sequence for the same route, style, seed, and interval", () => {
    const route = loadRouteFromFile(join(fixturesDir, "city-loop.route.json"));
    const options = { route, drivingStyle: "normal", seed: 99, startTimestampMs: 1_700_000_000_000, intervalMs: 1000 } as const;
    const first = createVehicleSimulator(options);
    const second = createVehicleSimulator(options);

    expect(states(first, 20)).toEqual(states(second, 20));
  });

  it("produces the same vehicle-state sequence from the generated fallback route", () => {
    const route = resolveSimulationRoute(undefined);
    const options = { route, drivingStyle: "normal", seed: 99, startTimestampMs: 1_700_000_000_000, intervalMs: 1000 } as const;
    const first = createVehicleSimulator(options);
    const second = createVehicleSimulator(options);

    expect(states(first, 20)).toEqual(states(second, 20));
  });

  it("applies driving-style differences to speed, acceleration, braking, idling, and harsh events", () => {
    const route = loadRouteFromFile(join(fixturesDir, "city-loop.route.json"));
    const baseOptions = { route, seed: 11, startTimestampMs: 1_700_000_000_000, intervalMs: 1000 } as const;
    const eco = summarize(states(createVehicleSimulator({ ...baseOptions, drivingStyle: "eco" }), 140));
    const normal = summarize(states(createVehicleSimulator({ ...baseOptions, drivingStyle: "normal" }), 140));
    const aggressive = summarize(states(createVehicleSimulator({ ...baseOptions, drivingStyle: "aggressive" }), 140));

    expect([eco.maxSpeedKph, normal.maxSpeedKph, aggressive.maxSpeedKph]).not.toEqual([eco.maxSpeedKph, eco.maxSpeedKph, eco.maxSpeedKph]);
    expect([eco.maxAccelerationMps2, normal.maxAccelerationMps2, aggressive.maxAccelerationMps2]).toEqual([0.8, 1.4, 2.3]);
    expect([eco.maxBrakingMps2, normal.maxBrakingMps2, aggressive.maxBrakingMps2]).not.toEqual([0, 0, 0]);
    expect(new Set([eco.idleCount, normal.idleCount, aggressive.idleCount]).size).toBeGreaterThan(1);
    expect(aggressive.harshEventCount).toBeGreaterThan(eco.harshEventCount);
  });

  it("progresses smoothly between route points and represents ignition and movement states", () => {
    const route = loadRouteFromFile(join(fixturesDir, "city-loop.route.json"));
    const simulator = createVehicleSimulator({ route, drivingStyle: "normal", seed: 5, startTimestampMs: 1_700_000_000_000, intervalMs: 1000 });
    const generated = states(simulator, 8);

    expect(generated.every((state) => state.ignitionOn)).toBe(true);
    expect(generated.some((state) => state.movement)).toBe(true);
    expect(generated[7]?.tripDistanceMeters).toBeGreaterThan(generated[1]?.tripDistanceMeters ?? Number.POSITIVE_INFINITY);
    expect(generated[2]?.position.latitude).toBeGreaterThan(generated[1]?.position.latitude ?? Number.POSITIVE_INFINITY);
    expect(generated[2]?.position.latitude).toBeLessThan(route.points[1]?.latitude ?? Number.NEGATIVE_INFINITY);
    expect(generated[2]?.position.longitude).toBeGreaterThan(generated[1]?.position.longitude ?? Number.POSITIVE_INFINITY);
  });
});

function states(simulator: ReturnType<typeof createVehicleSimulator>, count: number) {
  return Array.from({ length: count }, () => simulator.next());
}

function summarize(sequence: ReturnType<typeof states>) {
  return {
    maxSpeedKph: Math.max(...sequence.map((state) => state.speedKph)),
    maxAccelerationMps2: Math.max(...sequence.map((state) => state.accelerationMps2)),
    maxBrakingMps2: Math.max(...sequence.map((state) => state.brakingMps2)),
    idleCount: sequence.filter((state) => state.isIdling).length,
    harshEventCount: sequence.flatMap((state) => state.events).filter((event) => event.type === "harshAcceleration" || event.type === "harshBraking")
      .length
  };
}
