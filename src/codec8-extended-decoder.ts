import type { AvlIoElement, AvlIoGroups, AvlPriority, AvlRecord } from "./domain";
import { crc16Ibm } from "./codec-crc";

const codec8ExtendedId = 0x8e;
const minimumPacketLength = 12;

export type Codec8ExtendedDecodeErrorKind =
  | "invalid_preamble"
  | "invalid_length"
  | "unsupported_codec"
  | "crc_mismatch"
  | "record_count_mismatch"
  | "truncated_field"
  | "unsupported_packet_shape";

export interface Codec8ExtendedDecodeError {
  kind: Codec8ExtendedDecodeErrorKind;
  message: string;
  field?: string;
  offset?: number;
  expected?: number | string;
  actual?: number | string;
}

export interface DecodedCodec8ExtendedPacket {
  codecId: typeof codec8ExtendedId;
  dataLength: number;
  recordCount: number;
  records: readonly AvlRecord[];
  crc: number;
}

export type Codec8ExtendedDecodeResult =
  | { ok: true; packet: DecodedCodec8ExtendedPacket }
  | { ok: false; error: Codec8ExtendedDecodeError };

export function decodeCodec8ExtendedPacket(packet: Uint8Array): Codec8ExtendedDecodeResult {
  const frame = Buffer.from(packet);

  if (frame.byteLength < minimumPacketLength) {
    return error("invalid_length", "packet is shorter than the minimum Codec 8 Extended frame", {
      expected: minimumPacketLength,
      actual: frame.byteLength
    });
  }

  if (!frame.subarray(0, 4).equals(Buffer.alloc(4))) {
    return error("invalid_preamble", "packet preamble must be four zero bytes", {
      field: "preamble"
    });
  }

  const dataLength = frame.readUInt32BE(4);
  const expectedLength = 8 + dataLength + 4;
  if (frame.byteLength !== expectedLength) {
    return error("invalid_length", "packet length does not match the declared data length", {
      field: "dataLength",
      expected: expectedLength,
      actual: frame.byteLength
    });
  }

  const dataField = frame.subarray(8, 8 + dataLength);
  const crc = frame.readUInt32BE(8 + dataLength);
  const actualCrc = crc16Ibm(dataField);
  if (actualCrc !== crc) {
    return error("crc_mismatch", "packet CRC does not match the declared data field", {
      field: "crc",
      expected: crc,
      actual: actualCrc
    });
  }

  const state: DecodeState = { frame: dataField, offset: 0, limit: dataField.byteLength };

  const codecId = readUInt8(state, "codecId");
  if (!codecId.ok) {
    return codecId;
  }
  if (codecId.value !== codec8ExtendedId) {
    return error("unsupported_codec", "packet codec is not Codec 8 Extended", {
      field: "codecId",
      expected: codec8ExtendedId,
      actual: codecId.value
    });
  }

  const firstRecordCount = readUInt8(state, "recordCount");
  if (!firstRecordCount.ok) {
    return firstRecordCount;
  }
  if (firstRecordCount.value === 0) {
    return error("unsupported_packet_shape", "packet must contain at least one AVL record", {
      field: "recordCount"
    });
  }

  const repeatedRecordCountOffset = state.limit - 1;
  const records: AvlRecord[] = [];
  while (records.length < firstRecordCount.value) {
    if (state.offset >= repeatedRecordCountOffset) {
      return error("truncated_field", "packet ended before all declared AVL records were decoded", {
        field: "record",
        offset: state.offset,
        expected: firstRecordCount.value,
        actual: records.length
      });
    }

    const record = decodeRecord(state, records.length);
    if (!record.ok) {
      return record;
    }
    records.push(record.value);
  }

  if (state.offset !== repeatedRecordCountOffset) {
    return error("unsupported_packet_shape", "unexpected bytes remain before the repeated record count", {
      field: "recordCount",
      offset: state.offset,
      expected: repeatedRecordCountOffset,
      actual: state.offset
    });
  }

  const repeatedRecordCount = readUInt8(state, "repeatedRecordCount");
  if (!repeatedRecordCount.ok) {
    return repeatedRecordCount;
  }
  if (repeatedRecordCount.value !== firstRecordCount.value || records.length !== firstRecordCount.value) {
    return error("record_count_mismatch", "record counts do not match the decoded AVL record total", {
      field: "recordCount",
      expected: firstRecordCount.value,
      actual: repeatedRecordCount.value
    });
  }

  return {
    ok: true,
    packet: {
      codecId: codec8ExtendedId,
      dataLength,
      recordCount: firstRecordCount.value,
      records,
      crc
    }
  };
}

interface DecodeState {
  frame: Buffer;
  offset: number;
  limit: number;
}

function decodeRecord(
  state: DecodeState,
  recordIndex: number
): { ok: true; value: AvlRecord } | { ok: false; error: Codec8ExtendedDecodeError } {
  const timestamp = readInt64Number(state, "timestampMs");
  if (!timestamp.ok) {
    return timestamp;
  }

  const priority = readUInt8(state, "priority");
  if (!priority.ok) {
    return priority;
  }
  if (priority.value !== 0 && priority.value !== 1 && priority.value !== 2) {
    return error("unsupported_packet_shape", "AVL priority must be 0, 1, or 2", {
      field: "priority",
      offset: state.offset - 1,
      actual: priority.value
    });
  }

  const longitude = readInt32(state, "longitude");
  if (!longitude.ok) {
    return longitude;
  }
  const latitude = readInt32(state, "latitude");
  if (!latitude.ok) {
    return latitude;
  }
  const altitude = readInt16(state, "altitudeMeters");
  if (!altitude.ok) {
    return altitude;
  }
  const heading = readUInt16(state, "headingDegrees");
  if (!heading.ok) {
    return heading;
  }
  const satellites = readUInt8(state, "satellites");
  if (!satellites.ok) {
    return satellites;
  }
  const speed = readUInt16(state, "speedKph");
  if (!speed.ok) {
    return speed;
  }
  const eventIoId = readUInt16(state, "eventIoId");
  if (!eventIoId.ok) {
    return eventIoId;
  }
  const totalIoCount = readUInt16(state, "totalIoCount");
  if (!totalIoCount.ok) {
    return totalIoCount;
  }

  const oneByte = decodeNumericGroup(state, "oneByte", 1);
  if (!oneByte.ok) {
    return oneByte;
  }
  const twoBytes = decodeNumericGroup(state, "twoBytes", 2);
  if (!twoBytes.ok) {
    return twoBytes;
  }
  const fourBytes = decodeNumericGroup(state, "fourBytes", 4);
  if (!fourBytes.ok) {
    return fourBytes;
  }
  const eightBytes = decodeBigIntGroup(state, "eightBytes");
  if (!eightBytes.ok) {
    return eightBytes;
  }
  const xBytes = decodeXByteGroup(state, "xBytes");
  if (!xBytes.ok) {
    return xBytes;
  }

  const actualIoCount =
    oneByte.value.length +
    twoBytes.value.length +
    fourBytes.value.length +
    eightBytes.value.length +
    xBytes.value.length;

  if (actualIoCount !== totalIoCount.value) {
    return error("record_count_mismatch", "total IO count does not match the decoded IO groups", {
      field: `records[${recordIndex}].totalIoCount`,
      expected: totalIoCount.value,
      actual: actualIoCount
    });
  }

  return {
    ok: true,
    value: {
      timestampMs: timestamp.value,
      priority: priority.value as AvlPriority,
      gps: {
        longitude: longitude.value,
        latitude: latitude.value,
        altitudeMeters: altitude.value,
        headingDegrees: heading.value,
        satellites: satellites.value,
        speedKph: speed.value
      },
      eventIoId: eventIoId.value,
      io: {
        oneByte: oneByte.value,
        twoBytes: twoBytes.value,
        fourBytes: fourBytes.value,
        eightBytes: eightBytes.value,
        xBytes: xBytes.value
      }
    }
  };
}

function decodeNumericGroup(
  state: DecodeState,
  groupName: keyof Pick<AvlIoGroups, "oneByte" | "twoBytes" | "fourBytes">,
  valueByteLength: 1 | 2 | 4
): { ok: true; value: AvlIoElement<number>[] } | { ok: false; error: Codec8ExtendedDecodeError } {
  const count = readUInt16(state, `${groupName}Count`);
  if (!count.ok) {
    return count;
  }

  const values: AvlIoElement<number>[] = [];
  for (let index = 0; index < count.value; index += 1) {
    const id = readUInt16(state, `${groupName}[${index}].id`);
    if (!id.ok) {
      return id;
    }
    const value = readUnsigned(state, `${groupName}[${index}].value`, valueByteLength);
    if (!value.ok) {
      return value;
    }
    values.push({ id: id.value, value: value.value });
  }

  return { ok: true, value: values };
}

function decodeBigIntGroup(
  state: DecodeState,
  groupName: "eightBytes"
): { ok: true; value: AvlIoElement<bigint>[] } | { ok: false; error: Codec8ExtendedDecodeError } {
  const count = readUInt16(state, `${groupName}Count`);
  if (!count.ok) {
    return count;
  }

  const values: AvlIoElement<bigint>[] = [];
  for (let index = 0; index < count.value; index += 1) {
    const id = readUInt16(state, `${groupName}[${index}].id`);
    if (!id.ok) {
      return id;
    }
    const value = readBigUInt64(state, `${groupName}[${index}].value`);
    if (!value.ok) {
      return value;
    }
    values.push({ id: id.value, value: value.value });
  }

  return { ok: true, value: values };
}

function decodeXByteGroup(
  state: DecodeState,
  groupName: "xBytes"
): { ok: true; value: AvlIoElement<Uint8Array>[] } | { ok: false; error: Codec8ExtendedDecodeError } {
  const count = readUInt16(state, `${groupName}Count`);
  if (!count.ok) {
    return count;
  }

  const values: AvlIoElement<Uint8Array>[] = [];
  for (let index = 0; index < count.value; index += 1) {
    const id = readUInt16(state, `${groupName}[${index}].id`);
    if (!id.ok) {
      return id;
    }
    const length = readUInt16(state, `${groupName}[${index}].length`);
    if (!length.ok) {
      return length;
    }
    const data = readBytes(state, `${groupName}[${index}].value`, length.value);
    if (!data.ok) {
      return data;
    }
    values.push({ id: id.value, value: data.value });
  }

  return { ok: true, value: values };
}

function readUInt8(
  state: DecodeState,
  field: string
): { ok: true; value: number } | { ok: false; error: Codec8ExtendedDecodeError } {
  return readNumber(state, field, 1, (offset) => state.frame.readUInt8(offset));
}

function readUInt16(
  state: DecodeState,
  field: string
): { ok: true; value: number } | { ok: false; error: Codec8ExtendedDecodeError } {
  return readNumber(state, field, 2, (offset) => state.frame.readUInt16BE(offset));
}

function readInt16(
  state: DecodeState,
  field: string
): { ok: true; value: number } | { ok: false; error: Codec8ExtendedDecodeError } {
  return readNumber(state, field, 2, (offset) => state.frame.readInt16BE(offset));
}

function readInt32(
  state: DecodeState,
  field: string
): { ok: true; value: number } | { ok: false; error: Codec8ExtendedDecodeError } {
  return readNumber(state, field, 4, (offset) => state.frame.readInt32BE(offset));
}

function readUnsigned(
  state: DecodeState,
  field: string,
  byteLength: 1 | 2 | 4
): { ok: true; value: number } | { ok: false; error: Codec8ExtendedDecodeError } {
  return readNumber(state, field, byteLength, (offset) => state.frame.readUIntBE(offset, byteLength));
}

function readBigUInt64(
  state: DecodeState,
  field: string
): { ok: true; value: bigint } | { ok: false; error: Codec8ExtendedDecodeError } {
  const bounds = ensureReadable(state, field, 8);
  if (!bounds.ok) {
    return bounds;
  }

  const value = state.frame.readBigUInt64BE(state.offset);
  state.offset += 8;
  return { ok: true, value };
}

function readInt64Number(
  state: DecodeState,
  field: string
): { ok: true; value: number } | { ok: false; error: Codec8ExtendedDecodeError } {
  const bounds = ensureReadable(state, field, 8);
  if (!bounds.ok) {
    return bounds;
  }

  const value = state.frame.readBigInt64BE(state.offset);
  state.offset += 8;
  const asNumber = Number(value);
  if (!Number.isSafeInteger(asNumber)) {
    return error("unsupported_packet_shape", "timestamp does not fit the repository number model safely", {
      field,
      actual: value.toString()
    });
  }
  return { ok: true, value: asNumber };
}

function readBytes(
  state: DecodeState,
  field: string,
  length: number
): { ok: true; value: Uint8Array } | { ok: false; error: Codec8ExtendedDecodeError } {
  const bounds = ensureReadable(state, field, length);
  if (!bounds.ok) {
    return bounds;
  }

  const value = new Uint8Array(state.frame.subarray(state.offset, state.offset + length));
  state.offset += length;
  return { ok: true, value };
}

function readNumber(
  state: DecodeState,
  field: string,
  byteLength: number,
  reader: (offset: number) => number
): { ok: true; value: number } | { ok: false; error: Codec8ExtendedDecodeError } {
  const bounds = ensureReadable(state, field, byteLength);
  if (!bounds.ok) {
    return bounds;
  }

  const value = reader(state.offset);
  state.offset += byteLength;
  return { ok: true, value };
}

function ensureReadable(
  state: DecodeState,
  field: string,
  byteLength: number
): { ok: true } | { ok: false; error: Codec8ExtendedDecodeError } {
  if (state.offset + byteLength > state.limit) {
    return error("truncated_field", `${field} extends past the declared data field`, {
      field,
      offset: state.offset,
      expected: byteLength,
      actual: Math.max(0, state.limit - state.offset)
    });
  }

  return { ok: true };
}

function error(
  kind: Codec8ExtendedDecodeErrorKind,
  message: string,
  details: Omit<Codec8ExtendedDecodeError, "kind" | "message"> = {}
): { ok: false; error: Codec8ExtendedDecodeError } {
  return {
    ok: false,
    error: {
      kind,
      message,
      ...details
    }
  };
}
