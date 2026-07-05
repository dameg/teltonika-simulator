import net from "node:net";
import { once } from "node:events";
import { afterEach, describe, expect, it } from "vitest";

import { encodeCodec8ExtendedPacket } from "../src";
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

describe("Teltonika parser fixture", () => {
  const fixtures: TeltonikaParserFixture[] = [];
  const sockets: net.Socket[] = [];

  afterEach(async () => {
    await Promise.allSettled(sockets.splice(0).map(closeSocket));
    await Promise.allSettled(fixtures.splice(0).map((fixture) => fixture.close()));
  });

  it("records the exact IMEI frame and accepts the device by default", async () => {
    const fixture = await useFixture();
    const socket = await connectClient(fixture);
    const imeiFrame = encodeImeiFrame("123456789012345");

    socket.write(imeiFrame);

    const recorded = await fixture.waitForImeiFrame();
    const acknowledgement = await readBytes(socket, 1);

    expect(recorded.rawFrame).toEqual(imeiFrame);
    expect(recorded.imei).toBe("123456789012345");
    expect(fixture.imeiFrames).toHaveLength(1);
    expect(acknowledgement).toEqual(Buffer.from([0x01]));
  });

  it("can reject IMEIs with a configurable response byte", async () => {
    const fixture = await useFixture({ imeiResponseByte: 0x00 });
    const socket = await connectClient(fixture);

    socket.write(encodeImeiFrame("999999999999999"));

    expect(await readBytes(socket, 1)).toEqual(Buffer.from([0x00]));
  });

  it("records an exact AVL frame and acknowledges a configurable record count", async () => {
    const fixture = await useFixture({ avlAcknowledgementCount: 7 });
    const socket = await connectClient(fixture);
    const avlFrame = encodeCodec8ExtendedPacket([baseRecord]);

    socket.write(encodeImeiFrame("123456789012345"));
    await readBytes(socket, 1);
    socket.write(avlFrame);

    const recorded = await fixture.waitForAvlFrame();
    const acknowledgement = await readBytes(socket, 4);

    expect(recorded).toEqual(avlFrame);
    expect(fixture.avlFrames).toHaveLength(1);
    expect(acknowledgement.readUInt32BE(0)).toBe(7);
  });

  it("buffers fragmented IMEI and AVL frames until the full packet arrives", async () => {
    const fixture = await useFixture({ avlAcknowledgementCount: 3 });
    const socket = await connectClient(fixture);
    const imeiFrame = encodeImeiFrame("123456789012345");
    const avlFrame = encodeCodec8ExtendedPacket([baseRecord]);

    socket.write(imeiFrame.subarray(0, 4));
    socket.write(imeiFrame.subarray(4));

    const recordedImei = await fixture.waitForImeiFrame();
    expect(recordedImei.rawFrame).toEqual(imeiFrame);
    expect(await readBytes(socket, 1)).toEqual(Buffer.from([0x01]));

    socket.write(avlFrame.subarray(0, 5));
    socket.write(avlFrame.subarray(5, 12));
    socket.write(avlFrame.subarray(12));

    const recordedAvl = await fixture.waitForAvlFrame();
    expect(recordedAvl).toEqual(avlFrame);
    expect((await readBytes(socket, 4)).readUInt32BE(0)).toBe(3);
  });

  it("can close the server-side socket for reconnect scenarios", async () => {
    const fixture = await useFixture();
    const socket = await connectClient(fixture);

    await fixture.waitForConnection();
    const closePromise = once(socket, "close");

    await fixture.closeClientSocket();
    await closePromise;

    expect(fixture.clientSockets).toHaveLength(0);
    expect(socket.destroyed).toBe(true);
  });

  async function useFixture(options?: Parameters<typeof startTeltonikaParserFixture>[0]) {
    const fixture = await startTeltonikaParserFixture(options);
    fixtures.push(fixture);
    return fixture;
  }

  async function connectClient(fixture: TeltonikaParserFixture) {
    const socket = net.createConnection({ host: fixture.host, port: fixture.port });
    sockets.push(socket);
    await once(socket, "connect");
    return socket;
  }
});

function encodeImeiFrame(imei: string): Buffer {
  const payload = Buffer.from(imei, "ascii");
  const frame = Buffer.alloc(payload.length + 2);
  frame.writeUInt16BE(payload.length, 0);
  payload.copy(frame, 2);
  return frame;
}

async function readBytes(socket: net.Socket, size: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;

  while (total < size) {
    const chunk = socket.read(size - total);
    if (chunk !== null) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      chunks.push(buffer);
      total += buffer.length;
      continue;
    }

    await once(socket, "readable");
  }

  return Buffer.concat(chunks, total);
}

async function closeSocket(socket: net.Socket): Promise<void> {
  if (socket.destroyed) {
    return;
  }
  socket.destroy();
  await once(socket, "close");
}
