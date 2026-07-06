import { expect } from "vitest";

import { crc16Ibm } from "../../src";

export function assertCodec8ExtendedPacket(packet: Buffer, expectedRecordCount: number) {
  const dataLength = packet.readUInt32BE(4);
  const dataField = packet.subarray(8, 8 + dataLength);

  expect(packet.subarray(0, 4)).toEqual(Buffer.alloc(4));
  expect(dataLength).toBe(packet.byteLength - 12);
  expect(dataField[0]).toBe(0x8e);
  expect(dataField[1]).toBe(expectedRecordCount);
  expect(dataField[dataField.length - 1]).toBe(expectedRecordCount);
  expect(packet.readUInt32BE(8 + dataLength)).toBe(crc16Ibm(dataField));
}
