import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";

import { runLiveSession } from "../src";
import { startTeltonikaParserFixture, type TeltonikaParserFixture } from "./fixtures/teltonika-parser-fixture";

const routeFile = `${__dirname}/fixtures/city-loop.route.json`;

describe("live session runtime", () => {
  const fixtures: TeltonikaParserFixture[] = [];

  afterEach(async () => {
    await Promise.allSettled(fixtures.splice(0).map((fixture) => fixture.close()));
  });

  it("sends multiple AVL packets over one accepted session until aborted", async () => {
    const fixture = await useFixture();
    const controller = new AbortController();

    const sessionPromise = runLiveSession({
      host: fixture.host,
      port: fixture.port,
      imei: "123456789012345",
      intervalMs: 5,
      routeFile,
      drivingStyle: "normal",
      seed: 7,
      deviceProfile: "default-codec8e",
      signal: controller.signal
    });

    await fixture.waitForAvlFrame(3);
    controller.abort();

    await expect(sessionPromise).resolves.toEqual({ kind: "completed" });
    expect(fixture.avlFrames).toHaveLength(3);
  });

  it("produces the same packet sequence for the same route, style, seed, and interval", async () => {
    const first = await collectPacketHexSequence();
    const second = await collectPacketHexSequence();

    expect(first).toEqual(second);
  });

  it("advances AVL record timestamps by the configured interval", async () => {
    const fixture = await useFixture();
    const controller = new AbortController();

    const sessionPromise = runLiveSession({
      host: fixture.host,
      port: fixture.port,
      imei: "123456789012345",
      intervalMs: 250,
      routeFile,
      drivingStyle: "normal",
      seed: 7,
      deviceProfile: "default-codec8e",
      signal: controller.signal
    });

    await fixture.waitForAvlFrame(2);
    controller.abort();
    await sessionPromise;

    const timestamps = fixture.avlFrames.slice(0, 2).map(packetTimestampMs);
    expect(timestamps[1] - timestamps[0]).toBe(250);
  });

  it("closes the TCP session cleanly on abort without sending extra packets", async () => {
    const fixture = await useFixture();
    const controller = new AbortController();

    const sessionPromise = runLiveSession({
      host: fixture.host,
      port: fixture.port,
      imei: "123456789012345",
      intervalMs: 1_000,
      routeFile,
      drivingStyle: "normal",
      seed: 7,
      deviceProfile: "default-codec8e",
      signal: controller.signal
    });

    const serverSocket = await fixture.waitForConnection();
    await fixture.waitForAvlFrame();
    const sentBeforeAbort = fixture.avlFrames.length;
    const closed = waitForSocketClose(serverSocket);

    controller.abort();

    await expect(sessionPromise).resolves.toEqual({ kind: "completed" });
    await closed;
    await delay(25);

    expect(fixture.avlFrames).toHaveLength(sentBeforeAbort);
  });

  it("shuts down cleanly when aborted during a pending IMEI acknowledgement", async () => {
    const fixture = await useFixture({ sendImeiResponse: false });
    const controller = new AbortController();

    const sessionPromise = runLiveSession({
      host: fixture.host,
      port: fixture.port,
      imei: "123456789012345",
      intervalMs: 5,
      routeFile,
      drivingStyle: "normal",
      seed: 7,
      deviceProfile: "default-codec8e",
      signal: controller.signal
    });

    await fixture.waitForConnection();
    await fixture.waitForImeiFrame();

    controller.abort();

    await expect(sessionPromise).resolves.toEqual({ kind: "completed" });
    await waitForClientDisconnect(fixture);

    expect(fixture.clientSockets).toHaveLength(0);
    expect(fixture.avlFrames).toHaveLength(0);
  });

  async function useFixture(
    options?: Parameters<typeof startTeltonikaParserFixture>[0]
  ): Promise<TeltonikaParserFixture> {
    const fixture = await startTeltonikaParserFixture(options);
    fixtures.push(fixture);
    return fixture;
  }
});

async function collectPacketHexSequence(): Promise<string[]> {
  const fixture = await startTeltonikaParserFixture();
  const controller = new AbortController();

  try {
    const sessionPromise = runLiveSession({
      host: fixture.host,
      port: fixture.port,
      imei: "123456789012345",
      intervalMs: 5,
      routeFile,
      drivingStyle: "normal",
      seed: 7,
      deviceProfile: "default-codec8e",
      signal: controller.signal
    });

    await fixture.waitForAvlFrame(3);
    controller.abort();
    await sessionPromise;

    return fixture.avlFrames.map((frame) => frame.toString("hex"));
  } finally {
    await fixture.close();
  }
}

function packetTimestampMs(packet: Buffer): number {
  return Number(packet.readBigInt64BE(10));
}

function waitForSocketClose(socket: { destroyed: boolean; once(event: "close", listener: () => void): unknown }): Promise<void> {
  if (socket.destroyed) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    socket.once("close", () => resolve());
  });
}

async function waitForClientDisconnect(
  fixture: Pick<TeltonikaParserFixture, "clientSockets">
): Promise<void> {
  while (fixture.clientSockets.length > 0) {
    await delay(1);
  }
}
