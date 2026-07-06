import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createDryRunOutput,
  parseConfig,
  runLiveSession,
  runMultiDeviceRuntime
} from "../src";
import { assertCodec8ExtendedPacket } from "./fixtures/assert-codec8-extended-packet";
import {
  startTeltonikaParserFixture,
  type TeltonikaParserFixture
} from "./fixtures/teltonika-parser-fixture";

const routeFile = join(__dirname, "fixtures", "city-loop.route.json");

describe("end-to-end parser-visible coverage", () => {
  const fixtures: TeltonikaParserFixture[] = [];

  afterEach(async () => {
    await Promise.allSettled(fixtures.splice(0).map((fixture) => fixture.close()));
  });

  it("verifies IMEI handshake and route-driven Codec 8 Extended AVL exchange", async () => {
    const fixture = await useFixture();
    const controller = new AbortController();
    const imei = "123456789012345";

    const sessionPromise = runLiveSession({
      host: fixture.host,
      port: fixture.port,
      imei,
      intervalMs: 25,
      routeFile,
      drivingStyle: "normal",
      seed: 7,
      deviceProfile: "default-codec8e",
      signal: controller.signal
    });

    const imeiFrame = await fixture.waitForImeiFrame(1);
    await fixture.waitForAvlFrame(2);
    controller.abort();

    await expect(sessionPromise).resolves.toEqual({ kind: "completed" });

    expect(imeiFrame.imei).toBe(imei);
    expect(imeiFrame.rawFrame.readUInt16BE(0)).toBe(imei.length);
    expect(imeiFrame.rawFrame.subarray(2).toString("ascii")).toBe(imei);

    const avlFrames = fixture.avlFrameRecords.slice(0, 2);
    expect(avlFrames).toHaveLength(2);

    for (const frame of avlFrames) {
      expect(frame.connectionId).toBe(imeiFrame.connectionId);
      expect(frame.imei).toBe(imei);
      assertCodec8ExtendedPacket(frame.rawFrame, 1);
    }

    expect(avlFrames[0]?.rawFrame.equals(avlFrames[1]?.rawFrame ?? Buffer.alloc(0))).toBe(false);
  });

  it("captures parser-visible traffic for two concurrent imeis", async () => {
    const fixture = await useFixture();
    const controller = new AbortController();
    const imeis = ["123456789012345", "123456789012346"];

    const runtimePromise = runMultiDeviceRuntime({
      host: fixture.host,
      port: fixture.port,
      imeis,
      intervalMs: 25,
      reconnectDelayMs: 25,
      routeFile,
      drivingStyle: "normal",
      seed: 7,
      deviceProfile: "default-codec8e",
      signal: controller.signal
    });

    await fixture.waitForImeiFrame(2);
    await waitFor(() => observedImeis(fixture).size === 2);
    controller.abort();

    const result = await runtimePromise;

    expect(result.devices).toHaveLength(2);
    expect(result.devices.every((device) => device.result.kind === "completed")).toBe(true);
    expect(new Set(fixture.imeiFrames.map((frame) => frame.imei))).toEqual(new Set(imeis));
    expect(observedImeis(fixture)).toEqual(new Set(imeis));
    expect(new Set(fixture.imeiFrames.map((frame) => frame.connectionId)).size).toBe(2);
    expect(new Set(fixture.avlFrameRecords.map((frame) => frame.connectionId)).size).toBe(2);
  });

  it("keeps dry-run output deterministic for a fixed route, style, seed, and interval", () => {
    const config = createDryRunConfig();

    const first = createDryRunOutput(config);
    const second = createDryRunOutput(config);

    expect(first).toEqual(second);
  });

  async function useFixture(): Promise<TeltonikaParserFixture> {
    const fixture = await startTeltonikaParserFixture();
    fixtures.push(fixture);
    return fixture;
  }
});

function createDryRunConfig() {
  const result = parseConfig(
    [
      "--host",
      "127.0.0.1",
      "--port",
      "5027",
      "--imei",
      "123456789012345",
      "--route-file",
      routeFile,
      "--seed",
      "7",
      "--interval-ms",
      "1000",
      "--count",
      "2",
      "--dry-run",
      "--driving-style",
      "normal"
    ],
    {}
  );

  if (result.kind !== "simulator") {
    throw new Error("expected dry-run simulator config");
  }

  return result.config;
}

function observedImeis(fixture: TeltonikaParserFixture) {
  return new Set(
    fixture.avlFrameRecords
      .map((frame) => frame.imei)
      .filter((imei): imei is string => imei !== null)
  );
}

async function waitFor(predicate: () => boolean, timeoutMs = 1_000): Promise<void> {
  const startedAt = Date.now();

  while (!predicate()) {
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error("Timed out waiting for condition.");
    }

    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
}
