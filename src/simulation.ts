import type { DrivingStyleName, RouteDefinition } from "./domain";

export interface SimulationClockOptions {
  startTimestampMs: number;
  intervalMs: number;
}

export interface SimulationClock {
  readonly intervalMs: number;
  timestampAt(step: number): number;
  peek(): number;
  next(): number;
}

export interface SeededRandom {
  next(): number;
  nextBetween(min: number, max: number): number;
  nextInt(min: number, maxExclusive: number): number;
}

export interface DeterministicSimulationOptions extends SimulationClockOptions {
  route: RouteDefinition;
  drivingStyle: DrivingStyleName;
  seed: number | string;
}

export interface DeterministicSimulationContext {
  key: string;
  clock: SimulationClock;
  random: SeededRandom;
}

export function createSimulationClock(options: SimulationClockOptions): SimulationClock {
  const startTimestampMs = integerAtLeast(options.startTimestampMs, "startTimestampMs", 0);
  const intervalMs = integerAtLeast(options.intervalMs, "intervalMs", 1);
  let step = 0;

  return {
    intervalMs,
    timestampAt(stepIndex: number): number {
      return startTimestampMs + integerAtLeast(stepIndex, "step", 0) * intervalMs;
    },
    peek(): number {
      return this.timestampAt(step);
    },
    next(): number {
      const timestamp = this.timestampAt(step);
      step += 1;
      return timestamp;
    }
  };
}

export function createSeededRandom(seed: number | string): SeededRandom {
  let state = hashSeed(seed);

  return {
    next(): number {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
    },
    nextBetween(min: number, max: number): number {
      if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) {
        throw new Error("random range must be finite with max greater than or equal to min");
      }
      return min + this.next() * (max - min);
    },
    nextInt(min: number, maxExclusive: number): number {
      if (!Number.isInteger(min) || !Number.isInteger(maxExclusive) || maxExclusive <= min) {
        throw new Error("random integer range must use integers with max greater than min");
      }
      return Math.floor(this.nextBetween(min, maxExclusive));
    }
  };
}

export function createDeterministicSimulationContext(options: DeterministicSimulationOptions): DeterministicSimulationContext {
  const key = simulationDeterminismKey(options);
  return {
    key,
    clock: createSimulationClock(options),
    random: createSeededRandom(key)
  };
}

export function simulationDeterminismKey(options: DeterministicSimulationOptions): string {
  const intervalMs = integerAtLeast(options.intervalMs, "intervalMs", 1);
  integerAtLeast(options.startTimestampMs, "startTimestampMs", 0);
  return [options.route.metadata.id, options.drivingStyle, String(options.seed), String(intervalMs)].join("|");
}

function hashSeed(seed: number | string): number {
  const text = String(seed);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function integerAtLeast(value: number, name: string, min: number): number {
  if (!Number.isSafeInteger(value) || value < min) {
    throw new Error(`${name} must be an integer greater than or equal to ${min}`);
  }
  return value;
}
