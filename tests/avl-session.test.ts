import { once } from "node:events";
import type net from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import { encodeCodec8ExtendedPacket, performImeiHandshake, sendAvlPacket } from "../src";
import type { AvlRecord } from "../src";
import { startTeltonikaParserFixture, type TeltonikaParserFixture } from "./fixtures/teltonika-parser-fixture";

const baseRecord = {
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
    eightBytes: [],
    xBytes: []
  }
} satisfies AvlRecord;

describe("AVL packet session behavior", () => {
  const fixtures: TeltonikaParserFixture[] = [];
  const sockets: net.Socket[] = [];

  afterEach(async () => {
    await Promise.allSettled(sockets.splice(0).map(closeSocket));
    await Promise.allSettled(fixtures.splice(0).map((fixture) => fixture.close()));
  });

  it("sends one exact AVL packet after IMEI acceptance and accepts a matching record count", async () => {
    const fixture = await useFixture({ avlAcknowledgementCount: 1 });
    const expectedPacket = encodeCodec8ExtendedPacket([baseRecord]);
    const handshake = await performImeiHandshake({
      host: fixture.host,
      port: fixture.port,
      imei: "123456789012345"
    });

    expect(handshake.kind).toBe("accepted");
    if (handshake.kind !== "accepted") {
      throw new Error("expected accepted handshake");
    }
    sockets.push(handshake.socket);

    const result = await sendAvlPacket(handshake.socket, [baseRecord]);
    const recorded = await fixture.waitForAvlFrame();

    expect(recorded).toEqual(expectedPacket);
    expect(fixture.avlFrames).toEqual([expectedPacket]);
    expect(result).toEqual({
      acceptedRecordCount: 1,
      packetHex: expectedPacket.toString("hex"),
    });
    expect(handshake.socket.destroyed).toBe(false);
  });

  it("fails clearly on a mismatched acknowledgement count and does not retry", async () => {
    const fixture = await useFixture({ avlAcknowledgementCount: 0 });
    const handshake = await performAcceptedHandshake(fixture);
    const serverSocket = fixture.clientSockets[0];
    const serverClose = once(serverSocket, "close");

    const resultPromise = sendAvlPacket(handshake.socket, [baseRecord]);
    const recorded = await fixture.waitForAvlFrame();

    await expect(resultPromise).rejects.toThrow(
      "AVL acknowledgement count mismatch: expected 1 record(s), received 0."
    );
    await serverClose;

    expect(recorded).toEqual(encodeCodec8ExtendedPacket([baseRecord]));
    expect(fixture.avlFrames).toHaveLength(1);
    expect(fixture.clientSockets).toHaveLength(0);
    expect(handshake.socket.destroyed).toBe(true);
  });

  it("reassembles fragmented acknowledgement bytes before comparing the count", async () => {
    const fixture = await useFixture({ avlAcknowledgementCount: 1, avlAcknowledgementChunkSizes: [1, 1, 2] });
    const handshake = await performAcceptedHandshake(fixture);

    const result = await sendAvlPacket(handshake.socket, [baseRecord]);

    expect(await fixture.waitForAvlFrame()).toEqual(encodeCodec8ExtendedPacket([baseRecord]));
    expect(result.acceptedRecordCount).toBe(1);
    expect(handshake.socket.destroyed).toBe(false);
  });

  async function useFixture(options?: Parameters<typeof startTeltonikaParserFixture>[0]) {
    const fixture = await startTeltonikaParserFixture(options);
    fixtures.push(fixture);
    return fixture;
  }

  async function performAcceptedHandshake(fixture: TeltonikaParserFixture) {
    const result = await performImeiHandshake({
      host: fixture.host,
      port: fixture.port,
      imei: "123456789012345"
    });

    if (result.kind !== "accepted") {
      throw new Error("expected accepted handshake");
    }

    sockets.push(result.socket);
    return result;
  }
});

async function closeSocket(socket: net.Socket): Promise<void> {
  if (socket.destroyed) {
    return;
  }
  socket.destroy();
  await once(socket, "close");
}
