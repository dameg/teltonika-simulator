import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { encodeCodec8ExtendedRecord } from "../src";
import type { AvlRecord } from "../src";

describe("Codec 8 Extended AVL record encoding", () => {
  it("encodes GPS fields and grouped IO in Codec 8 Extended order", () => {
    const record = {
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

    expect(encodeCodec8ExtendedRecord(record).toString("hex")).toBe(
      [
        "0000018bcfe56800",
        "01",
        "a5df3348",
        "20989ac0",
        "0078",
        "005a",
        "0c",
        "002a",
        "00ef",
        "0005",
        "000100ef01",
        "0001004235e8",
        "000100c70001e240",
        "0001004e00000b3a73ce2ff2",
        "00010100000356494e"
      ].join("")
    );
  });

  it("encodes zero IO groups with 2-byte counts", () => {
    const record = {
      timestampMs: 0,
      priority: 0,
      gps: {
        longitude: 0,
        latitude: 0,
        altitudeMeters: 0,
        headingDegrees: 0,
        satellites: 0,
        speedKph: 0
      },
      eventIoId: 0,
      io: {
        oneByte: [],
        twoBytes: [],
        fourBytes: [],
        eightBytes: [],
        xBytes: []
      }
    } satisfies AvlRecord;

    expect(encodeCodec8ExtendedRecord(record).toString("hex")).toBe(
      "0000000000000000000000000000000000000000000000000000000000000000000000000000"
    );
  });

  it("rejects values that cannot fit their protocol fields", () => {
    const record = {
      timestampMs: 0,
      priority: 0,
      gps: {
        longitude: 0x80000000,
        latitude: 0,
        altitudeMeters: 0,
        headingDegrees: 0,
        satellites: 0,
        speedKph: 0
      },
      eventIoId: 0,
      io: {
        oneByte: [],
        twoBytes: [],
        fourBytes: [],
        eightBytes: [],
        xBytes: []
      }
    } satisfies AvlRecord;

    expect(() => encodeCodec8ExtendedRecord(record)).toThrow("longitude must be a signed 32-bit integer");
  });

  it("keeps codec record encoding independent from route, simulation, and TCP modules", () => {
    const source = readFileSync("src/codec8-extended.ts", "utf8");

    expect(source).not.toMatch(/^\s*import .*["'](?:node:net|net)["']/m);
    expect(source).not.toMatch(/^\s*import .*["'].*(?:route|driving-style|simulation|tcp|session).*["']/im);
  });
});
