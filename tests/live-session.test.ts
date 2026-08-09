import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";

import { runLiveSession } from "../src/live-session";
import type {
  LiveSessionConfiguration,
  LiveSessionRecordAcceptedContext
} from "../src/live-session";
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

  it("resumes at the next acknowledged record and preserves the accepted count", async () => {
    const baseline = await collectPacketHexSequence(4);
    const firstFixture = await useFixture();
    const firstContexts: LiveSessionRecordAcceptedContext[] = [];
    const firstPackets: string[] = [];

    await expect(runLiveSession({
      host: firstFixture.host,
      port: firstFixture.port,
      imei: "123456789012345",
      intervalMs: 5,
      routeFile,
      drivingStyle: "normal",
      seed: 7,
      deviceProfile: "default-codec8e",
      packetCount: 2,
      onRecordAccepted: (_record, packetHex, context) => {
        firstPackets.push(packetHex);
        firstContexts.push(context);
      }
    })).resolves.toEqual({ kind: "completed" });

    const checkpoint = firstContexts.at(-1)?.checkpoint;
    expect(checkpoint).toBeDefined();
    expect(firstContexts.map((context) => context.acceptedRecordCount)).toEqual([1, 2]);
    expect(() => JSON.stringify(checkpoint)).not.toThrow();

    const secondFixture = await useFixture();
    const resumedPackets: string[] = [];
    const resumedCounts: number[] = [];
    await expect(runLiveSession({
      host: secondFixture.host,
      port: secondFixture.port,
      imei: "123456789012345",
      intervalMs: 5,
      routeFile,
      drivingStyle: "normal",
      seed: 7,
      deviceProfile: "default-codec8e",
      packetCount: 4,
      checkpoint,
      acceptedRecordCount: 2,
      onRecordAccepted: (_record, packetHex, context) => {
        resumedPackets.push(packetHex);
        resumedCounts.push(context.acceptedRecordCount);
      }
    })).resolves.toEqual({ kind: "completed" });

    expect([...firstPackets, ...resumedPackets]).toEqual(baseline);
    expect(resumedCounts).toEqual([3, 4]);
  });

  it("applies live configuration at the next packet boundary and reports its revision", async () => {
    const fixture = await useFixture();
    let configuration: Partial<LiveSessionConfiguration> = { configRevision: 1 };
    const accepted: Array<{
      timestampMs: number;
      ioIds: number[];
      context: LiveSessionRecordAcceptedContext;
    }> = [];

    await expect(runLiveSession({
      host: fixture.host,
      port: fixture.port,
      imei: "123456789012345",
      intervalMs: 5,
      routeFile,
      drivingStyle: "normal",
      seed: 7,
      deviceProfile: "default-codec8e",
      packetCount: 2,
      getCurrentConfiguration: () => configuration,
      onRecordAccepted: (record, _packetHex, context) => {
        accepted.push({
          timestampMs: record.timestampMs,
          ioIds: [
            ...record.io.oneByte,
            ...record.io.twoBytes,
            ...record.io.fourBytes,
            ...record.io.eightBytes,
            ...record.io.xBytes
          ].map((element) => element.id),
          context
        });
        if (accepted.length === 1) {
          configuration = {
            intervalMs: 10,
            simulationSpeed: 2,
            drivingStyle: "aggressive",
            seed: 8,
            deviceProfile: "fmc650-fms",
            packetCount: 2,
            configRevision: 2
          };
        }
      }
    })).resolves.toEqual({ kind: "completed" });

    expect(accepted.map(({ context }) => context.configuration.configRevision)).toEqual([1, 2]);
    expect((accepted[1]?.timestampMs ?? 0) - (accepted[0]?.timestampMs ?? 0)).toBe(20);
    expect(accepted[0]?.ioIds).not.toEqual(accepted[1]?.ioIds);
  });

  it("completes without another packet when a live packet limit is lowered", async () => {
    const fixture = await useFixture();
    let packetCount: number | undefined;
    let acceptedCount = 0;

    await expect(runLiveSession({
      host: fixture.host,
      port: fixture.port,
      imei: "123456789012345",
      intervalMs: 1,
      routeFile,
      drivingStyle: "normal",
      seed: 7,
      deviceProfile: "default-codec8e",
      getCurrentConfiguration: () => ({ packetCount }),
      onRecordAccepted: () => {
        acceptedCount += 1;
        packetCount = 1;
      }
    })).resolves.toEqual({ kind: "completed" });

    expect(acceptedCount).toBe(1);
    expect(fixture.avlFrames).toHaveLength(1);
  });

  it("awaits asynchronous accepted-record persistence before completing the packet boundary", async () => {
    const fixture = await useFixture();
    let releasePersistence = () => {};
    const persistenceGate = new Promise<void>((resolve) => {
      releasePersistence = resolve;
    });
    let markPersistenceStarted = () => {};
    const persistenceStarted = new Promise<void>((resolve) => {
      markPersistenceStarted = resolve;
    });

    let completed = false;
    const sessionPromise = runLiveSession({
      host: fixture.host,
      port: fixture.port,
      imei: "123456789012345",
      intervalMs: 5,
      routeFile,
      drivingStyle: "normal",
      seed: 7,
      deviceProfile: "default-codec8e",
      packetCount: 1,
      onRecordAccepted: async () => {
        markPersistenceStarted();
        await persistenceGate;
      },
    }).then((result) => {
      completed = true;
      return result;
    });

    await persistenceStarted;
    await delay(25);
    expect(completed).toBe(false);

    releasePersistence();
    await expect(sessionPromise).resolves.toEqual({ kind: "completed" });
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

  it("reconnects with a fresh IMEI handshake and preserves packet sequence after a socket close", async () => {
    const baseline = await collectPacketHexSequence(4);
    const fixture = await useFixture();
    const controller = new AbortController();
    const reconnectDelayMs = 40;

    const sessionPromise = runLiveSession({
      host: fixture.host,
      port: fixture.port,
      imei: "123456789012345",
      intervalMs: 5,
      reconnectDelayMs,
      routeFile,
      drivingStyle: "normal",
      seed: 7,
      deviceProfile: "default-codec8e",
      signal: controller.signal
    });

    await fixture.waitForAvlFrame(1);
    const disconnectAt = Date.now();
    await fixture.closeClientSocket();
    await delay(reconnectDelayMs / 2);
    expect(fixture.imeiFrames).toHaveLength(1);
    await fixture.waitForImeiFrame(2);
    await fixture.waitForAvlFrame(3);

    controller.abort();
    await expect(sessionPromise).resolves.toEqual({ kind: "completed" });

    expect(Date.now() - disconnectAt).toBeGreaterThanOrEqual(reconnectDelayMs);
    expect(fixture.imeiFrames).toHaveLength(2);
    expect(fixture.avlFrames.map((frame) => frame.toString("hex"))).toEqual([
      baseline[0] ?? "",
      baseline[1] ?? "",
      baseline[2] ?? ""
    ]);
    const timestamps = fixture.avlFrames.slice(0, 3).map(packetTimestampMs);
    expect(timestamps).toEqual([...timestamps].sort((left, right) => left - right));
  });

  it("does not reconnect after IMEI rejection", async () => {
    const fixture = await useFixture({ imeiResponseByte: 0x00 });

    await expect(
      runLiveSession({
        host: fixture.host,
        port: fixture.port,
        imei: "123456789012345",
        intervalMs: 5,
        reconnectDelayMs: 5,
        routeFile,
        drivingStyle: "normal",
        seed: 7,
        deviceProfile: "default-codec8e"
      })
    ).resolves.toEqual({ kind: "rejected" });

    await delay(20);

    expect(fixture.clientSockets).toHaveLength(0);
    expect(fixture.imeiFrames).toHaveLength(1);
    expect(fixture.avlFrames).toHaveLength(0);
  });

  it("does not silently retry after an AVL acknowledgement mismatch", async () => {
    const fixture = await useFixture({ avlAcknowledgementCount: 0 });
    let acceptedCallbackCount = 0;

    await expect(
      runLiveSession({
        host: fixture.host,
        port: fixture.port,
        imei: "123456789012345",
        intervalMs: 5,
        reconnectDelayMs: 5,
        routeFile,
        drivingStyle: "normal",
        seed: 7,
        deviceProfile: "default-codec8e",
        onRecordAccepted: () => {
          acceptedCallbackCount += 1;
        }
      })
    ).rejects.toThrow("AVL acknowledgement count mismatch: expected 1 record(s), received 0.");

    await delay(20);

    expect(fixture.imeiFrames).toHaveLength(1);
    expect(fixture.avlFrames).toHaveLength(1);
    expect(fixture.clientSockets).toHaveLength(0);
    expect(acceptedCallbackCount).toBe(0);
  });

  async function useFixture(
    options?: Parameters<typeof startTeltonikaParserFixture>[0]
  ): Promise<TeltonikaParserFixture> {
    const fixture = await startTeltonikaParserFixture(options);
    fixtures.push(fixture);
    return fixture;
  }
});

async function collectPacketHexSequence(count = 3): Promise<string[]> {
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

    await fixture.waitForAvlFrame(count);
    controller.abort();
    await sessionPromise;

    return fixture.avlFrames.slice(0, count).map((frame) => frame.toString("hex"));
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
