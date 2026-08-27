import { afterEach, describe, expect, it } from "vitest";

import { decodeCodec8ExtendedPacket } from "../src";
import { Device, presets } from "../src/library";
import {
  createTransmissionNoiseController,
  normalizeTransmissionNoiseOptions,
} from "../src/library/core";
import type { AvlRecord } from "../src";
import {
  startTeltonikaParserFixture,
  type TeltonikaParserFixture,
} from "./fixtures/teltonika-parser-fixture";

const baseRecord = {
  timestampMs: 1_700_000_000_000,
  priority: 0,
  gps: {
    longitude: 123,
    latitude: 456,
    altitudeMeters: 10,
    headingDegrees: 20,
    satellites: 8,
    speedKph: 50,
  },
  eventIoId: 1,
  io: {
    oneByte: [{ id: 318, value: 9 }],
    twoBytes: [],
    fourBytes: [],
    eightBytes: [],
    xBytes: [],
  },
} satisfies AvlRecord;

describe("deterministic transmission noise", () => {
  const fixtures: TeltonikaParserFixture[] = [];

  afterEach(async () => {
    await Promise.allSettled(fixtures.splice(0).map((fixture) => fixture.close()));
  });

  it("validates options, supplies a stable namespaced default seed, and is deterministic", () => {
    expect(() => normalizeTransmissionNoiseOptions({ latency: { minMs: 2, maxMs: 1 } }, 7)).toThrow(/maxMs/);
    expect(() => normalizeTransmissionNoiseOptions({ connectionDrop: { probability: 2 } }, 7)).toThrow(/probability/);
    expect(() => normalizeTransmissionNoiseOptions({ gpsJamming: { probability: 1, minDurationPackets: 0 } }, 7)).toThrow(/Duration/);

    const normalized = normalizeTransmissionNoiseOptions({ latency: { minMs: 2, maxMs: 8 } }, 7);
    expect(normalized?.seed).toContain("teltonika-simulator/transmission-noise/v1");

    const options = {
      seed: "repeatable",
      latency: { minMs: 2, maxMs: 8 },
      gpsJamming: { probability: 1, severity: "critical" as const, minDurationPackets: 2, maxDurationPackets: 2 },
    };
    const first = createTransmissionNoiseController(options, 7);
    const second = createTransmissionNoiseController(options, 7);
    if (!first || !second) {
      throw new Error("expected noise controllers");
    }

    expect(first.nextLatencyMs()).toBe(second.nextLatencyMs());
    expect(first.prepareRecord(baseRecord)).toEqual(second.prepareRecord(baseRecord));
    const jammed = first.prepareRecord(baseRecord).record;
    expect(baseRecord.io.oneByte).toEqual([{ id: 318, value: 9 }]);
    expect(jammed.gps).toMatchObject({ satellites: 0, speedKph: 0 });
    expect(jammed.io.oneByte.filter(({ id }) => id === 318)).toEqual([{ id: 318, value: 2 }]);
  });

  it("drops a connection once, reconnects, and accepts the unchanged pending record", async () => {
    const fixture = await useFixture();
    const device = new Device({
      imei: "123456789012345",
      host: fixture.host,
      port: fixture.port,
      route: presets.routes.rotterdamWarsaw,
      intervalMs: 1,
      reconnectDelayMs: 1,
      packetCount: 1,
      noise: { seed: 1, connectionDrop: { probability: 1 } },
    });
    const events: string[] = [];
    device.on("noiseInjected", ({ kind }) => events.push(kind));

    await device.start();
    await expect(device.done).resolves.toMatchObject({ kind: "completed" });

    expect(events).toEqual(["connectionDrop"]);
    expect(fixture.imeiFrames).toHaveLength(2);
    expect(fixture.avlFrames).toHaveLength(1);
    expect(decodeCodec8ExtendedPacket(fixture.avlFrames[0]).ok).toBe(true);
  });

  it("corrupts one CRC, waits for the bounded ACK timeout, then retransmits a valid frame", async () => {
    const fixture = await useFixture();
    const device = new Device({
      imei: "123456789012345",
      host: fixture.host,
      port: fixture.port,
      route: presets.routes.rotterdamWarsaw,
      intervalMs: 1,
      reconnectDelayMs: 1,
      ackTimeoutMs: 10,
      packetCount: 1,
      noise: { seed: 2, packetCorruption: { probability: 1 } },
    });
    const events: string[] = [];
    device.on("noiseInjected", ({ kind }) => events.push(kind));

    await device.start();
    await expect(device.done).resolves.toMatchObject({ kind: "completed" });

    expect(events).toEqual(["packetCorruption"]);
    expect(fixture.avlFrames).toHaveLength(2);
    expect(fixture.invalidAvlFrames).toHaveLength(1);
    expect(decodeCodec8ExtendedPacket(fixture.avlFrames[0]).ok).toBe(false);
    expect(decodeCodec8ExtendedPacket(fixture.avlFrames[1]).ok).toBe(true);
    expect(fixture.imeiFrames).toHaveLength(2);
  });

  it("emits warning and recovery GNSS jamming records without mutating simulation records", async () => {
    const fixture = await useFixture();
    const device = new Device({
      imei: "123456789012345",
      host: fixture.host,
      port: fixture.port,
      route: presets.routes.rotterdamWarsaw,
      intervalMs: 1,
      packetCount: 3,
      noise: {
        seed: "jamming",
        gpsJamming: { probability: 1, severity: "critical", minDurationPackets: 2, maxDurationPackets: 2 },
      },
    });
    const accepted: AvlRecord[] = [];
    const events: string[] = [];
    device.on("recordAccepted", ({ record }) => accepted.push(record));
    device.on("noiseInjected", ({ kind }) => events.push(kind));

    await device.start();
    await expect(device.done).resolves.toMatchObject({ kind: "completed" });

    expect(events).toEqual(["gpsJamming", "gpsJamming", "gpsJamming"]);
    expect(accepted.map((record) => record.io.oneByte.find(({ id }) => id === 318)?.value)).toEqual([2, 2, 0]);
    expect(accepted[0]).toMatchObject({ eventIoId: 318, priority: 1, gps: { satellites: 0, speedKph: 0 } });
    expect(accepted[2]).toMatchObject({ eventIoId: 318, priority: 1 });
  });

  function useFixture(options?: Parameters<typeof startTeltonikaParserFixture>[0]) {
    return startTeltonikaParserFixture(options).then((fixture) => {
      fixtures.push(fixture);
      return fixture;
    });
  }
});
