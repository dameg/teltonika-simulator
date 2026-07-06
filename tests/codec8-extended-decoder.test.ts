import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { crc16Ibm, decodeCodec8ExtendedPacket, encodeCodec8ExtendedPacket } from "../src";
import type { AvlRecord } from "../src";

const traccarCodec8ExtendedPacket =
  "00000000000000768e010000018fdc4b27cb015b3e33ceefa529030009013f0e0000022400010000000000000000000102240049010f0001c60106babbf36300550202806d0f0001ca01063456555565690202806b0f0001d10106467975425450020280690b0001c90106fa54ba8d00550b0001cf0106cabbf36300550100005455";

const roundTripRecord = {
  timestampMs: 1_700_000_000_000,
  priority: 1,
  gps: {
    longitude: -1_512_099_000,
    latitude: 546_872_000,
    altitudeMeters: 120,
    headingDegrees: 90,
    satellites: 12,
    speedKph: 42
  },
  eventIoId: 239,
  io: {
    oneByte: [{ id: 239, value: 1 }],
    twoBytes: [{ id: 66, value: 13_800 }],
    fourBytes: [{ id: 199, value: 123_456 }],
    eightBytes: [{ id: 78, value: 12_345_678_901_234n }],
    xBytes: [{ id: 256, value: new Uint8Array([0x56, 0x49, 0x4e]) }]
  }
} satisfies AvlRecord;

describe("Codec 8 Extended AVL packet decoding", () => {
  it("decodes an independent Traccar fixture", () => {
    const packet = Buffer.from(traccarCodec8ExtendedPacket, "hex");
    const decoded = decodeCodec8ExtendedPacket(packet);

    expect(decoded.ok).toBe(true);
    if (!decoded.ok) {
      return;
    }

    expect(decoded.packet.codecId).toBe(0x8e);
    expect(decoded.packet.dataLength).toBe(118);
    expect(decoded.packet.recordCount).toBe(1);
    expect(decoded.packet.crc).toBe(0x5455);
    expect(decoded.packet.records).toEqual([
      {
        timestampMs: 1_717_387_864_011,
        priority: 1,
        gps: {
          longitude: 1_530_803_150,
          latitude: -274_388_733,
          altitudeMeters: 9,
          headingDegrees: 319,
          satellites: 14,
          speedKph: 0
        },
        eventIoId: 548,
        io: {
          oneByte: [],
          twoBytes: [],
          fourBytes: [],
          eightBytes: [],
          xBytes: [
            {
              id: 548,
              value: new Uint8Array(
                Buffer.from(
                  "010f0001c60106babbf36300550202806d0f0001ca01063456555565690202806b0f0001d10106467975425450020280690b0001c90106fa54ba8d00550b0001cf0106cabbf3630055",
                  "hex"
                )
              )
            }
          ]
        }
      }
    ]);
  });

  it("round-trips repository AVL records including 8-byte and x-byte IO", () => {
    const encoded = encodeCodec8ExtendedPacket([roundTripRecord]);
    const decoded = decodeCodec8ExtendedPacket(encoded);

    expect(decoded).toEqual({
      ok: true,
      packet: {
        codecId: 0x8e,
        dataLength: encoded.readUInt32BE(4),
        recordCount: 1,
        crc: encoded.readUInt32BE(encoded.byteLength - 4),
        records: [roundTripRecord]
      }
    });
  });

  it("returns structured errors for malformed packets", () => {
    const validPacket = Buffer.from(traccarCodec8ExtendedPacket, "hex");

    expect(decodeCodec8ExtendedPacket(withByte(validPacket, 3, 0x01))).toMatchObject({
      ok: false,
      error: { kind: "invalid_preamble", field: "preamble" }
    });

    expect(decodeCodec8ExtendedPacket(withUInt32BE(validPacket, 4, 1))).toMatchObject({
      ok: false,
      error: { kind: "invalid_length", field: "dataLength" }
    });

    expect(decodeCodec8ExtendedPacket(withDataByteAndRecalculateCrc(validPacket, 0, 0x08))).toMatchObject({
      ok: false,
      error: { kind: "unsupported_codec", field: "codecId" }
    });

    expect(
      decodeCodec8ExtendedPacket(withDataByteAndRecalculateCrc(validPacket, validPacket.byteLength - 5 - 8, 0x02))
    ).toMatchObject({
      ok: false,
      error: { kind: "record_count_mismatch", field: "recordCount" }
    });

    expect(
      decodeCodec8ExtendedPacket(
        withByte(validPacket, validPacket.byteLength - 1, validPacket[validPacket.byteLength - 1] ^ 0xff)
      )
    ).toMatchObject({
      ok: false,
      error: { kind: "crc_mismatch", field: "crc" }
    });

    const roundTripPacket = encodeCodec8ExtendedPacket([roundTripRecord]);
    const xByteLengthOffset = roundTripPacket.byteLength - 10;
    expect(decodeCodec8ExtendedPacket(withDataUInt16AndRecalculateCrc(roundTripPacket, xByteLengthOffset - 8, 5))).toMatchObject({
      ok: false,
      error: { kind: "truncated_field", field: "xBytes[0].value" }
    });
  });

  it("keeps the decoder independent from runtime and networking modules", () => {
    const source = readFileSync("src/codec8-extended-decoder.ts", "utf8");

    expect(source).not.toMatch(/^\s*import .*["'](?:node:net|net)["']/m);
    expect(source).not.toMatch(/^\s*import .*["'].*(?:dashboard|session|runtime|tcp).*["']/im);
  });
});

function withByte(packet: Uint8Array, offset: number, value: number): Buffer {
  const copy = Buffer.from(packet);
  copy[offset] = value;
  return copy;
}

function withUInt32BE(packet: Uint8Array, offset: number, value: number): Buffer {
  const copy = Buffer.from(packet);
  copy.writeUInt32BE(value, offset);
  return copy;
}

function withDataByteAndRecalculateCrc(packet: Uint8Array, dataOffset: number, value: number): Buffer {
  const copy = Buffer.from(packet);
  const payloadOffset = 8 + dataOffset;
  copy[payloadOffset] = value;
  copy.writeUInt32BE(crc16Ibm(copy.subarray(8, copy.byteLength - 4)), copy.byteLength - 4);
  return copy;
}

function withDataUInt16AndRecalculateCrc(packet: Uint8Array, dataOffset: number, value: number): Buffer {
  const copy = Buffer.from(packet);
  copy.writeUInt16BE(value, 8 + dataOffset);
  copy.writeUInt32BE(crc16Ibm(copy.subarray(8, copy.byteLength - 4)), copy.byteLength - 4);
  return copy;
}
