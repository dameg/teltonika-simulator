import type { AvlRecord } from "./domain";
import { createSeededRandom, type SeededRandom } from "./simulation";

export type TransmissionNoiseKind = "latency" | "connectionDrop" | "packetCorruption" | "gpsJamming";

export interface TransmissionNoiseLatencyOptions {
  minMs: number;
  maxMs: number;
}

export interface TransmissionNoiseProbabilityOptions {
  probability: number;
}

export interface TransmissionNoiseGpsJammingOptions {
  probability: number;
  severity?: "warning" | "critical";
  minDurationPackets?: number;
  maxDurationPackets?: number;
}

export interface TransmissionNoiseOptions {
  seed?: number | string;
  latency?: TransmissionNoiseLatencyOptions;
  connectionDrop?: TransmissionNoiseProbabilityOptions;
  packetCorruption?: TransmissionNoiseProbabilityOptions;
  gpsJamming?: TransmissionNoiseGpsJammingOptions;
}

export interface TransmissionNoiseLatencyEventData {
  delayMs: number;
}

export interface TransmissionNoiseProbabilityEventData {
  probability: number;
}

export interface TransmissionNoiseGpsJammingEventData {
  severity: "warning" | "critical";
  state: "started" | "active" | "recovered";
  durationPackets?: number;
}

export type TransmissionNoiseEventData =
  | TransmissionNoiseLatencyEventData
  | TransmissionNoiseProbabilityEventData
  | TransmissionNoiseGpsJammingEventData;

export type TransmissionNoiseEvent =
  | { kind: "latency"; imei: string; recordTimestampMs: number; data: TransmissionNoiseLatencyEventData }
  | { kind: "connectionDrop"; imei: string; recordTimestampMs: number; data: TransmissionNoiseProbabilityEventData }
  | { kind: "packetCorruption"; imei: string; recordTimestampMs: number; data: TransmissionNoiseProbabilityEventData }
  | { kind: "gpsJamming"; imei: string; recordTimestampMs: number; data: TransmissionNoiseGpsJammingEventData };

export type PreparedTransmissionNoiseEvent =
  | { kind: "gpsJamming"; recordTimestampMs: number; data: TransmissionNoiseGpsJammingEventData };

export interface NormalizedTransmissionNoiseOptions {
  seed: number | string;
  latency?: TransmissionNoiseLatencyOptions;
  connectionDrop?: TransmissionNoiseProbabilityOptions;
  packetCorruption?: TransmissionNoiseProbabilityOptions;
  gpsJamming?: Required<TransmissionNoiseGpsJammingOptions>;
}

export interface PreparedNoiseRecord {
  record: AvlRecord;
  event?: PreparedTransmissionNoiseEvent;
}

export interface TransmissionNoiseController {
  prepareRecord(record: AvlRecord): PreparedNoiseRecord;
  nextLatencyMs(): number | undefined;
  shouldDropConnection(): boolean;
  shouldCorruptPacket(): boolean;
}

const gnssJammingIoId = 318;
const noiseNamespace = "teltonika-simulator/transmission-noise/v1";

export function normalizeTransmissionNoiseOptions(
  options: TransmissionNoiseOptions | undefined,
  deviceSeed: number | string,
): NormalizedTransmissionNoiseOptions | undefined {
  if (options === undefined) {
    return undefined;
  }
  if (!options || typeof options !== "object") {
    throw new RangeError("noise must be an object");
  }

  const seed = options.seed ?? `${String(deviceSeed)}:${noiseNamespace}`;
  if (typeof seed !== "string" && !Number.isSafeInteger(seed)) {
    throw new RangeError("noise.seed must be a string or safe integer");
  }

  return {
    seed,
    latency: options.latency === undefined ? undefined : normalizeLatency(objectOption(options.latency, "noise.latency")),
    connectionDrop: options.connectionDrop === undefined
      ? undefined
      : { probability: probability(objectOption(options.connectionDrop, "noise.connectionDrop").probability, "noise.connectionDrop.probability") },
    packetCorruption: options.packetCorruption === undefined
      ? undefined
      : { probability: probability(objectOption(options.packetCorruption, "noise.packetCorruption").probability, "noise.packetCorruption.probability") },
    gpsJamming: options.gpsJamming === undefined ? undefined : normalizeGpsJamming(objectOption(options.gpsJamming, "noise.gpsJamming")),
  };
}

export function createTransmissionNoiseController(
  options: TransmissionNoiseOptions | NormalizedTransmissionNoiseOptions | undefined,
  deviceSeed: number | string,
): TransmissionNoiseController | undefined {
  const normalized = normalizeTransmissionNoiseOptions(options, deviceSeed);
  if (!normalized) {
    return undefined;
  }

  const random = createSeededRandom(normalized.seed);
  let jammingPacketsRemaining = 0;
  let recoveryPending = false;

  return {
    prepareRecord(record) {
      if (!normalized.gpsJamming) {
        return { record };
      }

      if (jammingPacketsRemaining > 0) {
        jammingPacketsRemaining -= 1;
        if (jammingPacketsRemaining === 0) {
          recoveryPending = true;
        }
        return {
          record: jammedRecord(record, normalized.gpsJamming.severity, false),
          event: {
            kind: "gpsJamming",
            recordTimestampMs: record.timestampMs,
            data: { severity: normalized.gpsJamming.severity, state: "active" },
          },
        };
      }

      if (recoveryPending) {
        recoveryPending = false;
        return {
          record: recoveredRecord(record),
          event: {
            kind: "gpsJamming",
            recordTimestampMs: record.timestampMs,
            data: { severity: normalized.gpsJamming.severity, state: "recovered" },
          },
        };
      }

      if (random.next() >= normalized.gpsJamming.probability) {
        return { record };
      }

      const durationPackets = randomIntInclusive(
        random,
        normalized.gpsJamming.minDurationPackets,
        normalized.gpsJamming.maxDurationPackets,
      );
      jammingPacketsRemaining = durationPackets - 1;
      if (jammingPacketsRemaining === 0) {
        recoveryPending = true;
      }
      return {
        record: jammedRecord(record, normalized.gpsJamming.severity, true),
        event: {
          kind: "gpsJamming",
          recordTimestampMs: record.timestampMs,
          data: { severity: normalized.gpsJamming.severity, state: "started", durationPackets },
        },
      };
    },
    nextLatencyMs() {
      if (!normalized.latency) {
        return undefined;
      }
      return randomIntInclusive(random, normalized.latency.minMs, normalized.latency.maxMs);
    },
    shouldDropConnection() {
      return normalized.connectionDrop !== undefined && random.next() < normalized.connectionDrop.probability;
    },
    shouldCorruptPacket() {
      return normalized.packetCorruption !== undefined && random.next() < normalized.packetCorruption.probability;
    },
  };
}

function normalizeLatency(options: TransmissionNoiseLatencyOptions): TransmissionNoiseLatencyOptions {
  nonNegativeSafeInteger(options.minMs, "noise.latency.minMs");
  nonNegativeSafeInteger(options.maxMs, "noise.latency.maxMs");
  if (options.maxMs < options.minMs) {
    throw new RangeError("noise.latency.maxMs must be greater than or equal to noise.latency.minMs");
  }
  return { minMs: options.minMs, maxMs: options.maxMs };
}

function normalizeGpsJamming(options: TransmissionNoiseGpsJammingOptions): Required<TransmissionNoiseGpsJammingOptions> {
  const severity = options.severity ?? "warning";
  if (severity !== "warning" && severity !== "critical") {
    throw new RangeError("noise.gpsJamming.severity must be warning or critical");
  }
  const minDurationPackets = options.minDurationPackets ?? 1;
  const maxDurationPackets = options.maxDurationPackets ?? 1;
  probability(options.probability, "noise.gpsJamming.probability");
  positiveSafeInteger(minDurationPackets, "noise.gpsJamming.minDurationPackets");
  positiveSafeInteger(maxDurationPackets, "noise.gpsJamming.maxDurationPackets");
  if (maxDurationPackets < minDurationPackets) {
    throw new RangeError("noise.gpsJamming.maxDurationPackets must be greater than or equal to noise.gpsJamming.minDurationPackets");
  }
  return { probability: options.probability, severity, minDurationPackets, maxDurationPackets };
}

function probability(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be a finite number from 0 to 1`);
  }
  return value;
}

function objectOption<T>(value: T, name: string): T {
  if (!value || typeof value !== "object") {
    throw new RangeError(`${name} must be an object`);
  }
  return value;
}

function nonNegativeSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
}

function positiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}

function randomIntInclusive(random: SeededRandom, min: number, max: number): number {
  return min === max ? min : random.nextInt(min, max + 1);
}

function jammedRecord(record: AvlRecord, severity: "warning" | "critical", transition: boolean): AvlRecord {
  return withJammingIo(record, severity === "warning" ? 1 : 2, transition, severity === "critical");
}

function recoveredRecord(record: AvlRecord): AvlRecord {
  return withJammingIo(record, 0, true, false);
}

function withJammingIo(
  record: AvlRecord,
  value: number,
  isEvent: boolean,
  invalidateGps: boolean,
): AvlRecord {
  return {
    ...record,
    priority: isEvent && record.priority === 0 ? 1 : record.priority,
    eventIoId: isEvent ? gnssJammingIoId : record.eventIoId,
    gps: invalidateGps
      ? { ...record.gps, satellites: 0, speedKph: 0 }
      : { ...record.gps },
    io: {
      oneByte: [
        ...record.io.oneByte.filter((element) => element.id !== gnssJammingIoId),
        { id: gnssJammingIoId, value },
      ],
      twoBytes: record.io.twoBytes.map((element) => ({ ...element })),
      fourBytes: record.io.fourBytes.map((element) => ({ ...element })),
      eightBytes: record.io.eightBytes.map((element) => ({ ...element })),
      xBytes: record.io.xBytes.map((element) => ({ ...element, value: new Uint8Array(element.value) })),
    },
  };
}
