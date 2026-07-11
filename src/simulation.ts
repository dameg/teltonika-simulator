import type { DrivingEvent, DrivingStyleName, RouteDefinition, RouteGeometry, RouteSegment, VehicleState } from "./domain";
import { getDrivingStyleProfile } from "./driving-style";
import { buildRouteGeometry, interpolateRoutePosition } from "./route";

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

export interface VehicleSimulatorOptions extends DeterministicSimulationOptions {
  externalVoltageMv?: number;
  batteryVoltageMv?: number;
  simulationSpeed?: number;
}

export interface VehicleSimulator {
  next(): VehicleState;
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

export function createVehicleSimulator(options: VehicleSimulatorOptions): VehicleSimulator {
  const simulationIntervalMs = Math.max(1, Math.round(options.intervalMs * simulationSpeedMultiplier(options.simulationSpeed ?? 0)));
  const context = createDeterministicSimulationContext({ ...options, intervalMs: simulationIntervalMs });
  const profile = getDrivingStyleProfile(options.drivingStyle);
  const geometry = buildRouteGeometry(options.route);
  const intervalSeconds = context.clock.intervalMs / 1000;
  const externalVoltageMv = options.externalVoltageMv ?? 13_800;
  const batteryVoltageMv = options.batteryVoltageMv;
  let distanceMeters = 0;
  let tripDistanceMeters = 0;
  let speedMps = 0;
  let idleUntilMs = 0;

  return {
    next(): VehicleState {
      const timestampMs = context.clock.next();
      const position = interpolateRoutePosition(geometry, distanceMeters);
      const stopDurationMs = idleUntilMs > timestampMs ? idleUntilMs - timestampMs : stopDurationAt(geometry, position.segmentIndex, distanceMeters);
      const isIdling = stopDurationMs > 0 || context.random.next() < profile.idleProbability * 0.15;
      const events: DrivingEvent[] = [];
      const previousSpeedMps = speedMps;

      if (isIdling) {
        if (idleUntilMs <= timestampMs) {
          const idleDurationMs =
            stopDurationMs > 0 ? Math.round(stopDurationMs * (1 + profile.idleProbability * 5)) : Math.round(1000 + profile.idleProbability * 50_000);
          idleUntilMs = timestampMs + idleDurationMs;
          events.push({ type: "idleStarted", timestampMs });
        }
        speedMps = 0;
      } else if (idleUntilMs > 0) {
        idleUntilMs = 0;
        events.push({ type: "idleEnded", timestampMs });
      }

      const speedLimitKph = position.speedLimitKph ?? 50;
      const variation = context.random.nextBetween(-profile.speedVariationRatio, profile.speedVariationRatio);
      const turnFactor = turnSlowdown(geometry, position.segmentIndex, profile.corneringSlowdownRatio);
      const targetSpeedMps = isIdling ? 0 : kphToMps(Math.max(0, speedLimitKph * turnFactor * (1 + variation)));
      const deltaMps = targetSpeedMps - previousSpeedMps;
      const limit = deltaMps >= 0 ? profile.targetAccelerationMps2 : profile.brakingIntensityMps2;
      speedMps = isIdling ? 0 : previousSpeedMps + clamp(deltaMps, -limit * intervalSeconds, limit * intervalSeconds);
      const accelerationMps2 = (speedMps - previousSpeedMps) / intervalSeconds;
      const brakingMps2 = Math.max(0, -accelerationMps2);

      if (!isIdling) {
        if (context.random.next() < profile.harshAccelerationProbability) {
          events.push({ type: "harshAcceleration", timestampMs });
        }
        if (context.random.next() < profile.harshBrakingProbability) {
          events.push({ type: "harshBraking", timestampMs });
        }
        const traveledMeters = speedMps * intervalSeconds;
        distanceMeters = nextDistance(geometry, position.segmentIndex, distanceMeters, traveledMeters);
        tripDistanceMeters += traveledMeters;
      }

      return {
        timestampMs,
        position: {
          latitude: position.latitude,
          longitude: position.longitude,
          altitudeMeters: position.altitudeMeters,
          headingDegrees: position.headingDegrees,
          satellites: 12,
          hasGpsFix: true
        },
        speedKph: Math.round(mpsToKph(speedMps) * 10) / 10,
        tripDistanceMeters: Math.round(tripDistanceMeters * 10) / 10,
        accelerationMps2: Math.round(accelerationMps2 * 100) / 100,
        brakingMps2: Math.round(brakingMps2 * 100) / 100,
        isStopped: speedMps < 0.1,
        isIdling,
        ignitionOn: true,
        movement: speedMps >= 0.1,
        externalVoltageMv,
        ...(batteryVoltageMv === undefined ? {} : { batteryVoltageMv }),
        events
      };
    }
  };
}

export function simulationSpeedMultiplier(value: number): number {
  if (!Number.isInteger(value) || value < -10 || value > 10) {
    throw new RangeError("simulationSpeed must be an integer between -10 and 10");
  }
  return value < 0 ? 1 / Math.abs(value) : value || 1;
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

function stopDurationAt(geometry: RouteGeometry, segmentIndex: number, distanceMeters: number): number {
  const segment = geometry.segments[segmentIndex];
  if (!segment?.end.stopDurationMs || distanceToSegmentEnd(segment, distanceMeters, geometry.totalDistanceMeters) > 1) {
    return 0;
  }
  return segment.end.stopDurationMs;
}

function nextDistance(geometry: RouteGeometry, segmentIndex: number, distanceMeters: number, deltaMeters: number): number {
  const segment = geometry.segments[segmentIndex];
  if (segment?.end.stopDurationMs && distanceMeters < segment.endDistanceMeters && distanceMeters + deltaMeters >= segment.endDistanceMeters) {
    return segment.endDistanceMeters;
  }
  return distanceMeters + deltaMeters;
}

function distanceToSegmentEnd(segment: RouteSegment, distanceMeters: number, totalDistanceMeters: number): number {
  return segment.endDistanceMeters === totalDistanceMeters && distanceMeters >= totalDistanceMeters
    ? 0
    : Math.abs(segment.endDistanceMeters - (distanceMeters % totalDistanceMeters));
}

function turnSlowdown(geometry: RouteGeometry, segmentIndex: number, corneringSlowdownRatio: number): number {
  const segment = geometry.segments[segmentIndex];
  const next = geometry.segments[(segmentIndex + 1) % geometry.segments.length];
  if (!segment || !next) {
    return 1;
  }
  const headingDelta = Math.abs(((next.headingDegrees - segment.headingDegrees + 540) % 360) - 180);
  return headingDelta > 30 ? corneringSlowdownRatio : 1;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function kphToMps(value: number): number {
  return value / 3.6;
}

function mpsToKph(value: number): number {
  return value * 3.6;
}
