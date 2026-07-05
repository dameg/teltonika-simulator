import { describe, expect, it } from "vitest";

import { crc16Ibm, crc16IbmProtocolField } from "../src";

const traccarCodec8ExtendedPacket =
  "00000000000000768e010000018fdc4b27cb015b3e33ceefa529030009013f0e0000022400010000000000000000000102240049010f0001c60106babbf36300550202806d0f0001ca01063456555565690202806b0f0001d10106467975425450020280690b0001c90106fa54ba8d00550b0001cf0106cabbf36300550100005455";

describe("CRC-16/IBM", () => {
  it("matches the standard check vector", () => {
    // CRC-16/IBM: poly 0x8005 reflected as 0xA001, init 0x0000, refin/refout true, xorout 0x0000.
    expect(crc16Ibm(Buffer.from("123456789", "ascii"))).toBe(0xbb3d);
  });

  it("validates a known Teltonika packet fixture over only the data field", () => {
    const packet = Buffer.from(traccarCodec8ExtendedPacket, "hex");
    const dataLength = packet.readUInt32BE(4);
    const dataField = packet.subarray(8, 8 + dataLength);
    const crcField = packet.readUInt32BE(8 + dataLength);

    expect(crc16Ibm(dataField)).toBe(0x5455);
    expect(crc16Ibm(dataField)).toBe(crcField);
    expect(crc16Ibm(packet.subarray(0, 8 + dataLength))).not.toBe(crcField);
  });

  it("changes when a data-field byte changes", () => {
    const packet = Buffer.from(traccarCodec8ExtendedPacket, "hex");
    const dataLength = packet.readUInt32BE(4);
    const dataField = Buffer.from(packet.subarray(8, 8 + dataLength));
    const original = crc16Ibm(dataField);

    dataField[10] = (dataField[10] ?? 0) ^ 0xff;

    expect(crc16Ibm(dataField)).not.toBe(original);
  });

  it("places the 16-bit CRC in the low half of the 4-byte protocol field", () => {
    expect(crc16IbmProtocolField(Buffer.from("123456789", "ascii"))).toEqual(Buffer.from([0x00, 0x00, 0xbb, 0x3d]));
  });
});
