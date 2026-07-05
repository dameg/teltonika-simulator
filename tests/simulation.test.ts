import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { createDeterministicSimulationContext, createSeededRandom, createSimulationClock, simulationDeterminismKey } from "../src";
import type { RouteDefinition } from "../src";

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
