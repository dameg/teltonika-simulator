import type { AvlIoElement, AvlRecord } from "./domain";
import { crc16IbmProtocolField } from "./codec-crc";

const codec8ExtendedId = 0x8e;

export function encodeCodec8ExtendedPacket(records: readonly AvlRecord[]): Buffer {
  if (records.length === 0 || records.length > 0xff) {
    throw new RangeError("packet must contain from 1 to 255 AVL records");
  }

  const dataField = Buffer.concat([
    Buffer.from([codec8ExtendedId, records.length]),
    ...records.map(encodeCodec8ExtendedRecord),
    Buffer.from([records.length])
  ]);

  const header = Buffer.alloc(8);
  header.writeUInt32BE(0, 0);
  header.writeUInt32BE(dataField.byteLength, 4);

  return Buffer.concat([header, dataField, crc16IbmProtocolField(dataField)]);
}

export function encodeCodec8ExtendedRecord(record: AvlRecord): Buffer {
  const parts = [
    encodeTimestamp(record.timestampMs),
    oneByte(record.priority, "priority"),
    int32(record.gps.longitude, "longitude"),
    int32(record.gps.latitude, "latitude"),
    int16(record.gps.altitudeMeters, "altitude"),
    uint16(record.gps.headingDegrees, "heading"),
    oneByte(record.gps.satellites, "satellites"),
    uint16(record.gps.speedKph, "speed"),
    uint16(record.eventIoId, "event IO ID"),
    uint16(totalIoCount(record), "total IO count"),
    encodeNumericGroup(record.io.oneByte, 1),
    encodeNumericGroup(record.io.twoBytes, 2),
    encodeNumericGroup(record.io.fourBytes, 4),
    encodeBigIntGroup(record.io.eightBytes),
    encodeXByteGroup(record.io.xBytes)
  ];

  return Buffer.concat(parts);
}

function encodeNumericGroup(elements: readonly AvlIoElement<number>[], byteLength: 1 | 2 | 4): Buffer {
  return Buffer.concat([
    uint16(elements.length, "IO group count"),
    ...elements.flatMap((element) => [uint16(element.id, "IO ID"), unsignedInteger(element.value, byteLength, `IO value ${element.id}`)])
  ]);
}

function encodeBigIntGroup(elements: readonly AvlIoElement<bigint>[]): Buffer {
  return Buffer.concat([
    uint16(elements.length, "IO group count"),
    ...elements.flatMap((element) => [uint16(element.id, "IO ID"), uint64(element.value, `IO value ${element.id}`)])
  ]);
}

function encodeXByteGroup(elements: readonly AvlIoElement<Uint8Array>[]): Buffer {
  return Buffer.concat([
    uint16(elements.length, "X-byte IO group count"),
    ...elements.flatMap((element) => [
      uint16(element.id, "IO ID"),
      uint16(element.value.byteLength, `X-byte IO length ${element.id}`),
      Buffer.from(element.value)
    ])
  ]);
}

function totalIoCount(record: AvlRecord): number {
  return record.io.oneByte.length + record.io.twoBytes.length + record.io.fourBytes.length + record.io.eightBytes.length + record.io.xBytes.length;
}

function encodeTimestamp(timestampMs: number): Buffer {
  if (!Number.isSafeInteger(timestampMs) || timestampMs < 0) {
    throw new RangeError("timestamp must be a non-negative safe integer");
  }
  const buffer = Buffer.alloc(8);
  buffer.writeBigInt64BE(BigInt(timestampMs));
  return buffer;
}

function oneByte(value: number, name: string): Buffer {
  assertUnsigned(value, 0xff, name);
  return Buffer.from([value]);
}

function int16(value: number, name: string): Buffer {
  if (!Number.isSafeInteger(value) || value < -0x8000 || value > 0x7fff) {
    throw new RangeError(`${name} must be a signed 16-bit integer`);
  }
  const buffer = Buffer.alloc(2);
  buffer.writeInt16BE(value);
  return buffer;
}

function uint16(value: number, name: string): Buffer {
  assertUnsigned(value, 0xffff, name);
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16BE(value);
  return buffer;
}

function int32(value: number, name: string): Buffer {
  if (!Number.isSafeInteger(value) || value < -0x80000000 || value > 0x7fffffff) {
    throw new RangeError(`${name} must be a signed 32-bit integer`);
  }
  const buffer = Buffer.alloc(4);
  buffer.writeInt32BE(value);
  return buffer;
}

function unsignedInteger(value: number, byteLength: 1 | 2 | 4, name: string): Buffer {
  const max = 2 ** (byteLength * 8) - 1;
  assertUnsigned(value, max, name);
  const buffer = Buffer.alloc(byteLength);
  buffer.writeUIntBE(value, 0, byteLength);
  return buffer;
}

function uint64(value: bigint, name: string): Buffer {
  if (value < 0n || value > 0xffffffffffffffffn) {
    throw new RangeError(`${name} must be an unsigned 64-bit integer`);
  }
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(value);
  return buffer;
}

function assertUnsigned(value: number, max: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > max) {
    throw new RangeError(`${name} must be an unsigned integer from 0 to ${max}`);
  }
}
