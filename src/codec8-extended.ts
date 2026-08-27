import type { AvlIoElement, AvlRecord } from "./domain";
import { crc16Ibm } from "./codec-crc";

const codec8ExtendedId = 0x8e;
const maximumTcpPacketSize = 1_280;

export function encodeCodec8ExtendedPacket(records: readonly AvlRecord[]): Buffer {
  if (records.length === 0 || records.length > 0xff) {
    throw new RangeError("packet must contain from 1 to 255 AVL records");
  }

  const encodedRecords = records.map(encodeCodec8ExtendedRecord);
  const dataLength = 3 + encodedRecords.reduce((total, record) => total + record.byteLength, 0);
  const packetLength = 8 + dataLength + 4;
  if (packetLength > maximumTcpPacketSize) {
    throw new RangeError("Codec 8 Extended TCP packet must not exceed 1280 bytes");
  }

  const packet = Buffer.alloc(packetLength);
  packet.writeUInt32BE(dataLength, 4);
  packet[8] = codec8ExtendedId;
  packet[9] = records.length;
  let offset = 10;
  for (const record of encodedRecords) {
    record.copy(packet, offset);
    offset += record.byteLength;
  }
  packet[offset] = records.length;
  packet.writeUInt32BE(crc16Ibm(packet.subarray(8, 8 + dataLength)), 8 + dataLength);
  return packet;
}

export function encodeCodec8ExtendedRecord(record: AvlRecord): Buffer {
  validateRecord(record);
  const buffer = Buffer.alloc(recordByteLength(record));
  let offset = 0;
  buffer.writeBigInt64BE(BigInt(record.timestampMs), offset);
  offset += 8;
  buffer[offset] = record.priority;
  offset += 1;
  buffer.writeInt32BE(record.gps.longitude, offset);
  offset += 4;
  buffer.writeInt32BE(record.gps.latitude, offset);
  offset += 4;
  buffer.writeInt16BE(record.gps.altitudeMeters, offset);
  offset += 2;
  buffer.writeUInt16BE(record.gps.headingDegrees, offset);
  offset += 2;
  buffer[offset] = record.gps.satellites;
  offset += 1;
  buffer.writeUInt16BE(record.gps.speedKph, offset);
  offset += 2;
  buffer.writeUInt16BE(record.eventIoId, offset);
  offset += 2;
  buffer.writeUInt16BE(totalIoCount(record), offset);
  offset += 2;
  offset = writeNumericGroup(buffer, offset, record.io.oneByte, 1);
  offset = writeNumericGroup(buffer, offset, record.io.twoBytes, 2);
  offset = writeNumericGroup(buffer, offset, record.io.fourBytes, 4);
  offset = writeBigIntGroup(buffer, offset, record.io.eightBytes);
  writeXByteGroup(buffer, offset, record.io.xBytes);
  return buffer;
}

function totalIoCount(record: AvlRecord): number {
  return record.io.oneByte.length + record.io.twoBytes.length + record.io.fourBytes.length + record.io.eightBytes.length + record.io.xBytes.length;
}

function validateRecord(record: AvlRecord): void {
  if (!Number.isSafeInteger(record.timestampMs) || record.timestampMs < 0) {
    throw new RangeError("timestamp must be a non-negative safe integer");
  }
  if (record.priority !== 0 && record.priority !== 1 && record.priority !== 2) {
    throw new RangeError("priority must be 0, 1, or 2");
  }
  assertSignedRange(record.gps.longitude, -0x80000000, 0x7fffffff, "longitude", "32-bit");
  assertSignedRange(record.gps.latitude, -0x80000000, 0x7fffffff, "latitude", "32-bit");
  assertSignedRange(record.gps.altitudeMeters, -0x8000, 0x7fff, "altitude", "16-bit");
  assertUnsigned(record.gps.headingDegrees, 0xffff, "heading");
  assertUnsigned(record.gps.satellites, 0xff, "satellites");
  assertUnsigned(record.gps.speedKph, 0xffff, "speed");
  assertUnsigned(record.eventIoId, 0xffff, "event IO ID");
  assertUnsigned(totalIoCount(record), 0xffff, "total IO count");
  validateNumericGroup(record.io.oneByte, 1);
  validateNumericGroup(record.io.twoBytes, 2);
  validateNumericGroup(record.io.fourBytes, 4);
  validateBigIntGroup(record.io.eightBytes);
  validateXByteGroup(record.io.xBytes);
}

function recordByteLength(record: AvlRecord): number {
  return 28
    + numericGroupByteLength(record.io.oneByte, 1)
    + numericGroupByteLength(record.io.twoBytes, 2)
    + numericGroupByteLength(record.io.fourBytes, 4)
    + 2 + record.io.eightBytes.length * 10
    + 2 + record.io.xBytes.reduce((total, element) => total + 4 + element.value.byteLength, 0);
}

function numericGroupByteLength(elements: readonly AvlIoElement<number>[], valueByteLength: 1 | 2 | 4): number {
  return 2 + elements.length * (2 + valueByteLength);
}

function writeNumericGroup(
  buffer: Buffer,
  offset: number,
  elements: readonly AvlIoElement<number>[],
  valueByteLength: 1 | 2 | 4,
): number {
  buffer.writeUInt16BE(elements.length, offset);
  offset += 2;
  for (const element of elements) {
    buffer.writeUInt16BE(element.id, offset);
    offset += 2;
    buffer.writeUIntBE(element.value, offset, valueByteLength);
    offset += valueByteLength;
  }
  return offset;
}

function writeBigIntGroup(buffer: Buffer, offset: number, elements: readonly AvlIoElement<bigint>[]): number {
  buffer.writeUInt16BE(elements.length, offset);
  offset += 2;
  for (const element of elements) {
    buffer.writeUInt16BE(element.id, offset);
    offset += 2;
    buffer.writeBigUInt64BE(element.value, offset);
    offset += 8;
  }
  return offset;
}

function writeXByteGroup(buffer: Buffer, offset: number, elements: readonly AvlIoElement<Uint8Array>[]): number {
  buffer.writeUInt16BE(elements.length, offset);
  offset += 2;
  for (const element of elements) {
    buffer.writeUInt16BE(element.id, offset);
    offset += 2;
    buffer.writeUInt16BE(element.value.byteLength, offset);
    offset += 2;
    buffer.set(element.value, offset);
    offset += element.value.byteLength;
  }
  return offset;
}

function validateNumericGroup(elements: readonly AvlIoElement<number>[], valueByteLength: 1 | 2 | 4): void {
  assertUnsigned(elements.length, 0xffff, "IO group count");
  for (const element of elements) {
    assertUnsigned(element.id, 0xffff, "IO ID");
    assertUnsigned(element.value, 2 ** (valueByteLength * 8) - 1, `IO value ${element.id}`);
  }
}

function validateBigIntGroup(elements: readonly AvlIoElement<bigint>[]): void {
  assertUnsigned(elements.length, 0xffff, "IO group count");
  for (const element of elements) {
    assertUnsigned(element.id, 0xffff, "IO ID");
    if (element.value < 0n || element.value > 0xffffffffffffffffn) {
      throw new RangeError(`IO value ${element.id} must be an unsigned 64-bit integer`);
    }
  }
}

function validateXByteGroup(elements: readonly AvlIoElement<Uint8Array>[]): void {
  assertUnsigned(elements.length, 0xffff, "X-byte IO group count");
  for (const element of elements) {
    assertUnsigned(element.id, 0xffff, "IO ID");
    assertUnsigned(element.value.byteLength, 0xffff, `X-byte IO length ${element.id}`);
  }
}

function assertUnsigned(value: number, max: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > max) {
    throw new RangeError(`${name} must be an unsigned integer from 0 to ${max}`);
  }
}

function assertSignedRange(value: number, min: number, max: number, name: string, fieldSize: string): void {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be a signed ${fieldSize} integer`);
  }
}
