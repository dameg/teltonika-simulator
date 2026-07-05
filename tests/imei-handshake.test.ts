import { once } from "node:events";
import type net from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import { encodeImeiHandshakeFrame, performImeiHandshake } from "../src";
import { startTeltonikaParserFixture, type TeltonikaParserFixture } from "./fixtures/teltonika-parser-fixture";

describe("IMEI handshake session behavior", () => {
  const fixtures: TeltonikaParserFixture[] = [];
  const sockets: net.Socket[] = [];

  afterEach(async () => {
    await Promise.allSettled(sockets.splice(0).map(closeSocket));
    await Promise.allSettled(fixtures.splice(0).map((fixture) => fixture.close()));
  });

  it("sends the exact handshake bytes, returns acceptance, and leaves AVL unsent", async () => {
    const fixture = await useFixture({ imeiResponseByte: 0x01 });
    const expectedFrame = encodeImeiHandshakeFrame("123456789012345");

    const resultPromise = performImeiHandshake({
      host: fixture.host,
      port: fixture.port,
      imei: "123456789012345"
    });

    const serverSocket = await fixture.waitForConnection();
    const recorded = await fixture.waitForImeiFrame();
    const result = await resultPromise;

    expect(recorded.rawFrame).toEqual(expectedFrame);
    expect(recorded.imei).toBe("123456789012345");
    expect(fixture.avlFrames).toEqual([]);
    expect(result.kind).toBe("accepted");
    if (result.kind === "accepted") {
      sockets.push(result.socket);
      expect(result.socket.destroyed).toBe(false);
    }
    expect(serverSocket.destroyed).toBe(false);
  });

  it("stops the session on IMEI rejection without reconnecting", async () => {
    const fixture = await useFixture({ imeiResponseByte: 0x00 });

    const resultPromise = performImeiHandshake({
      host: fixture.host,
      port: fixture.port,
      imei: "999999999999999"
    });

    const serverSocket = await fixture.waitForConnection();
    const serverClose = once(serverSocket, "close");
    const recorded = await fixture.waitForImeiFrame();
    const result = await resultPromise;
    await serverClose;

    expect(recorded.imei).toBe("999999999999999");
    expect(result).toEqual({ kind: "rejected" });
    expect(fixture.imeiFrames).toHaveLength(1);
    expect(fixture.clientSockets).toHaveLength(0);
    expect(fixture.avlFrames).toEqual([]);
  });

  it("fails on unexpected acknowledgement bytes and closes the session", async () => {
    const fixture = await useFixture({ imeiResponseByte: 0x7f });

    const resultPromise = performImeiHandshake({
      host: fixture.host,
      port: fixture.port,
      imei: "123450000000000"
    });

    const serverSocket = await fixture.waitForConnection();
    const serverClose = once(serverSocket, "close");
    await fixture.waitForImeiFrame();

    await expect(resultPromise).rejects.toThrow("Unexpected IMEI acknowledgement byte: 0x7f.");
    await serverClose;

    expect(fixture.clientSockets).toHaveLength(0);
    expect(fixture.avlFrames).toEqual([]);
  });

  async function useFixture(options?: Parameters<typeof startTeltonikaParserFixture>[0]) {
    const fixture = await startTeltonikaParserFixture(options);
    fixtures.push(fixture);
    return fixture;
  }
});

async function closeSocket(socket: net.Socket): Promise<void> {
  if (socket.destroyed) {
    return;
  }
  socket.destroy();
  await once(socket, "close");
}
