import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runMultiDeviceRuntime } from "../src";
import {
  startTeltonikaParserFixture,
  type TeltonikaParserFixture
} from "./fixtures/teltonika-parser-fixture";

const routeFile = join(__dirname, "fixtures", "city-loop.route.json");

describe("multi-device runtime", () => {
  let fixture: TeltonikaParserFixture | null = null;

  afterEach(async () => {
    if (fixture) {
      await fixture.close();
      fixture = null;
    }
  });

  it("runs two imeis concurrently with distinct sessions", async () => {
    fixture = await startTeltonikaParserFixture();
    const controller = new AbortController();

    const runtimePromise = runMultiDeviceRuntime({
      host: fixture.host,
      port: fixture.port,
      imeis: ["123456789012345", "123456789012346"],
      intervalMs: 25,
      reconnectDelayMs: 25,
      routeFile,
      drivingStyle: "normal",
      seed: 7,
      deviceProfile: "default-codec8e",
      signal: controller.signal
    });

    await fixture.waitForImeiFrame(2);
    await waitFor(() => fixture!.avlFrameRecords.length >= 2);
    controller.abort();

    const result = await runtimePromise;
    const imeiSet = new Set(fixture.imeiFrames.map((frame) => frame.imei));
    const handshakeConnectionIds = new Set(
      fixture.imeiFrames.map((frame) => frame.connectionId)
    );
    const avlImeis = new Set(
      fixture.avlFrameRecords
        .map((frame) => frame.imei)
        .filter((imei): imei is string => imei !== null)
    );
    const avlConnectionIds = new Set(
      fixture.avlFrameRecords.map((frame) => frame.connectionId)
    );

    expect(result.devices).toHaveLength(2);
    expect(result.devices.every((device) => device.result.kind === "completed")).toBe(true);
    expect(imeiSet).toEqual(new Set(["123456789012345", "123456789012346"]));
    expect(handshakeConnectionIds.size).toBe(2);
    expect(avlImeis).toEqual(new Set(["123456789012345", "123456789012346"]));
    expect(avlConnectionIds.size).toBe(2);
  });

  it("keeps successful devices running when another imei is rejected", async () => {
    fixture = await startTeltonikaParserFixture({ sendImeiResponse: false });
    const controller = new AbortController();

    const runtimePromise = runMultiDeviceRuntime({
      host: fixture.host,
      port: fixture.port,
      imeis: ["123456789012345", "123456789012346"],
      intervalMs: 25,
      reconnectDelayMs: 25,
      routeFile,
      drivingStyle: "normal",
      seed: 7,
      deviceProfile: "default-codec8e",
      signal: controller.signal
    });

    await fixture.waitForImeiFrame(2);

    const acceptedFrame = fixture.imeiFrames.find(
      (frame) => frame.imei === "123456789012345"
    );
    const rejectedFrame = fixture.imeiFrames.find(
      (frame) => frame.imei === "123456789012346"
    );

    expect(acceptedFrame).toBeDefined();
    expect(rejectedFrame).toBeDefined();

    fixture.sendImeiResponse(acceptedFrame!.connectionId, 0x01);
    fixture.sendImeiResponse(rejectedFrame!.connectionId, 0x00);

    await waitFor(() =>
      fixture!.avlFrameRecords.some((frame) => frame.imei === "123456789012345")
    );

    controller.abort();
    const result = await runtimePromise;

    const acceptedResult = result.devices.find(
      (device) => device.imei === "123456789012345"
    );
    const rejectedResult = result.devices.find(
      (device) => device.imei === "123456789012346"
    );
    const rejectedAvlFrames = fixture.avlFrameRecords.filter(
      (frame) => frame.imei === "123456789012346"
    );

    expect(
      fixture.avlFrameRecords.some((frame) => frame.imei === "123456789012345")
    ).toBe(true);
    expect(rejectedAvlFrames).toHaveLength(0);
    expect(acceptedResult?.result.kind).toBe("completed");
    expect(rejectedResult?.result.kind).toBe("rejected");
  });

  it("keeps successful devices running when another imei fails after the handshake", async () => {
    fixture = await startTeltonikaParserFixture({ sendImeiResponse: false });
    const controller = new AbortController();

    const runtimePromise = runMultiDeviceRuntime({
      host: fixture.host,
      port: fixture.port,
      imeis: ["123456789012345", "123456789012346"],
      intervalMs: 25,
      reconnectDelayMs: 25,
      routeFile,
      drivingStyle: "normal",
      seed: 7,
      deviceProfile: "default-codec8e",
      signal: controller.signal
    });

    await fixture.waitForImeiFrame(2);

    const failedFrame = fixture.imeiFrames.find(
      (frame) => frame.imei === "123456789012345"
    );
    const successfulFrame = fixture.imeiFrames.find(
      (frame) => frame.imei === "123456789012346"
    );

    expect(failedFrame).toBeDefined();
    expect(successfulFrame).toBeDefined();

    fixture.setAvlAcknowledgementCount(0);
    fixture.sendImeiResponse(failedFrame!.connectionId, 0x01);

    await waitFor(() =>
      fixture!.avlFrameRecords.some(
        (frame) => frame.imei === "123456789012345"
      )
    );

    fixture.setAvlAcknowledgementCount(1);
    fixture.sendImeiResponse(successfulFrame!.connectionId, 0x01);

    await waitFor(() =>
      fixture!.avlFrameRecords.some(
        (frame) => frame.imei === "123456789012346"
      )
    );

    controller.abort();
    const result = await runtimePromise;

    const failedResult = result.devices.find(
      (device) => device.imei === "123456789012345"
    );
    const successfulResult = result.devices.find(
      (device) => device.imei === "123456789012346"
    );
    const failedAvlFrames = fixture.avlFrameRecords.filter(
      (frame) => frame.imei === "123456789012345"
    );
    const successfulAvlFrames = fixture.avlFrameRecords.filter(
      (frame) => frame.imei === "123456789012346"
    );

    expect(failedAvlFrames).toHaveLength(1);
    expect(successfulAvlFrames.length).toBeGreaterThanOrEqual(1);
    expect(failedAvlFrames[0]?.connectionId).not.toBe(
      successfulAvlFrames[0]?.connectionId
    );
    expect(failedResult?.result.kind).toBe("failed");
    const failedError =
      failedResult?.result.kind === "failed" ? failedResult.result.error : undefined;
    expect(failedError).toBeInstanceOf(Error);
    expect(failedError?.message).toBe(
      "AVL acknowledgement count mismatch: expected 1 record(s), received 0."
    );
    expect(successfulResult?.result.kind).toBe("completed");
  });
});

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 1_000
): Promise<void> {
  const startedAt = Date.now();

  while (!predicate()) {
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error("Timed out waiting for condition.");
    }

    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
}
