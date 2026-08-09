import type { AvlIoElement, AvlRecord } from "../../domain";
import type { DashboardTelemetrySnapshot } from "../domain";
import { createDashboardTelemetry } from "../telemetry";

export interface StoredAvlRecord {
  altitudeMeters: number;
  eventIoId: number;
  headingDegrees: number;
  latitudeE7: number;
  longitudeE7: number;
  priority: 0 | 1 | 2;
  satellites: number;
  speedKph: number;
  timestamp: Date | string;
}

export interface StoredAvlIoElement {
  byteaValue: Buffer | null;
  ioId: number;
  ioSizeBytes: number;
  numericValue: string | null;
}

export interface MappedStoredTelemetry {
  record: AvlRecord;
  telemetry: DashboardTelemetrySnapshot;
}

export function mapStoredTelemetry(
  storedRecord: StoredAvlRecord,
  storedElements: readonly StoredAvlIoElement[],
): MappedStoredTelemetry {
  const record = mapStoredAvlRecord(storedRecord, storedElements);
  return { record, telemetry: createDashboardTelemetry(record) };
}

export function mapStoredAvlRecord(
  storedRecord: StoredAvlRecord,
  storedElements: readonly StoredAvlIoElement[],
): AvlRecord {
  const oneByte: AvlIoElement<number>[] = [];
  const twoBytes: AvlIoElement<number>[] = [];
  const fourBytes: AvlIoElement<number>[] = [];
  const eightBytes: AvlIoElement<bigint>[] = [];
  const xBytes: AvlIoElement<Uint8Array>[] = [];

  for (const element of storedElements) {
    if (element.numericValue === null) {
      if (element.byteaValue === null) {
        throw new Error(`Stored IO element ${element.ioId} has no value.`);
      }
      xBytes.push({ id: element.ioId, value: Uint8Array.from(element.byteaValue) });
      continue;
    }

    if (element.byteaValue !== null) {
      throw new Error(`Stored IO element ${element.ioId} has two values.`);
    }

    const numericValue = BigInt(element.numericValue);
    if (element.ioSizeBytes === 8) {
      eightBytes.push({ id: element.ioId, value: numericValue });
      continue;
    }

    if (element.ioSizeBytes !== 1 && element.ioSizeBytes !== 2 && element.ioSizeBytes !== 4) {
      throw new Error(`Stored numeric IO element ${element.ioId} has an invalid size.`);
    }

    const numberValue = Number(numericValue);
    if (!Number.isSafeInteger(numberValue)) {
      throw new Error(`Stored IO element ${element.ioId} is not a safe integer.`);
    }

    const output = { id: element.ioId, value: numberValue };
    if (element.ioSizeBytes === 1) oneByte.push(output);
    if (element.ioSizeBytes === 2) twoBytes.push(output);
    if (element.ioSizeBytes === 4) fourBytes.push(output);
  }

  return {
    timestampMs: storedTimestampMs(storedRecord.timestamp),
    priority: storedRecord.priority,
    gps: {
      longitude: storedRecord.longitudeE7,
      latitude: storedRecord.latitudeE7,
      altitudeMeters: storedRecord.altitudeMeters,
      headingDegrees: storedRecord.headingDegrees,
      satellites: storedRecord.satellites,
      speedKph: storedRecord.speedKph,
    },
    eventIoId: storedRecord.eventIoId,
    io: { oneByte, twoBytes, fourBytes, eightBytes, xBytes },
  };
}

function storedTimestampMs(value: Date | string): number {
  const timestampMs = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isSafeInteger(timestampMs)) {
    throw new Error("Stored AVL timestamp is invalid.");
  }
  return timestampMs;
}
