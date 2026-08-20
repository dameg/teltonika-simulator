import { afterEach, describe, expect, it } from "vitest";

import {
  Device,
  DeviceStartError,
  DeviceImeiRejectedError,
  DeviceStateError,
  presets,
} from "../src/library";
import {
  startTeltonikaParserFixture,
  type TeltonikaParserFixture,
} from "./fixtures/teltonika-parser-fixture";

describe("Device library API", () => {
  const fixtures: TeltonikaParserFixture[] = [];

  afterEach(async () => {
    await Promise.allSettled(fixtures.splice(0).map((fixture) => fixture.close()));
  });

  it("exposes validated route, driving-style, and device-profile presets", () => {
    expect(Object.keys(presets.routes)).toEqual([
      "barcelonaMilan",
      "gdanskVienna",
      "rotterdamGenoa",
      "rotterdamWarsaw",
      "strasbourgBudapest",
    ]);
    for (const route of Object.values(presets.routes)) {
      expect(route.metadata.id).toMatch(/-/);
      expect(route.points.length).toBeGreaterThan(0);
    }
    expect(presets.drivingStyles).toEqual({ eco: "eco", normal: "normal", aggressive: "aggressive" });
    expect(presets.deviceProfiles.fmc650Fms).toBe("fmc650-fms");
  });

  it("starts after IMEI acceptance, exposes lifecycle events, and stops cleanly", async () => {
    const fixture = await useFixture();
    const device = new Device({
      imei: "123456789012345",
      host: fixture.host,
      port: fixture.port,
      route: presets.routes.rotterdamWarsaw,
      intervalMs: 5,
    });
    const statuses: string[] = [];
    device.on("statusChange", ({ status }) => statuses.push(status));

    const startPromise = device.start();
    await fixture.waitForAvlFrame();
    await startPromise;

    expect(device.status).toBe("connected");
    expect(statuses).toContain("connecting");
    expect(statuses).toContain("connected");

    await device.stop();
    await device.stop();
    await expect(device.done).resolves.toMatchObject({ kind: "stopped" });
    expect(device.status).toBe("stopped");
  });

  it("emits accepted records and applies updates at the next packet boundary", async () => {
    const fixture = await useFixture();
    const device = new Device({
      imei: "123456789012345",
      host: fixture.host,
      port: fixture.port,
      route: presets.routes.rotterdamWarsaw,
      intervalMs: 5,
      packetCount: 2,
    });
    const accepted: Array<{ timestampMs: number; drivingStyle: string }> = [];
    device.on("recordAccepted", ({ record, context }) => {
      accepted.push({
        timestampMs: record.timestampMs,
        drivingStyle: context.configuration.drivingStyle,
      });
      if (accepted.length === 1) {
        device.update({ drivingStyle: "aggressive", intervalMs: 10 });
      }
    });

    await device.start();
    await expect(device.done).resolves.toMatchObject({ kind: "completed" });

    expect(accepted).toHaveLength(2);
    expect(accepted.map(({ drivingStyle }) => drivingStyle)).toEqual(["normal", "aggressive"]);
    expect(accepted[1].timestampMs - accepted[0].timestampMs).toBe(10);
  });

  it("rejects start when the parser rejects the IMEI", async () => {
    const fixture = await useFixture({ imeiResponseByte: 0x00 });
    const device = new Device({
      imei: "123456789012345",
      host: fixture.host,
      port: fixture.port,
      route: presets.routes.rotterdamWarsaw,
      intervalMs: 5,
    });

    await expect(device.start()).rejects.toBeInstanceOf(DeviceImeiRejectedError);
    await expect(device.done).resolves.toMatchObject({ kind: "rejected" });
    expect(device.status).toBe("rejected");
  });

  it("reports reconnects after a transient TCP failure", async () => {
    const fixture = await useFixture();
    const device = new Device({
      imei: "123456789012345",
      host: fixture.host,
      port: fixture.port,
      route: presets.routes.rotterdamWarsaw,
      intervalMs: 50,
      reconnectDelayMs: 1,
      packetCount: 2,
    });
    const reconnects: string[] = [];
    device.on("reconnecting", ({ reason }) => reconnects.push(reason));

    await device.start();
    await fixture.waitForAvlFrame();
    await fixture.closeClientSocket();
    await fixture.waitForAvlFrame(2);
    await expect(device.done).resolves.toMatchObject({ kind: "completed" });

    expect(reconnects.length).toBeGreaterThan(0);
  });

  it("stops while waiting for the IMEI response", async () => {
    const fixture = await useFixture({ sendImeiResponse: false });
    const device = new Device({
      imei: "123456789012345",
      host: fixture.host,
      port: fixture.port,
      route: presets.routes.rotterdamWarsaw,
      intervalMs: 5,
    });
    const startPromise = device.start();

    await fixture.waitForImeiFrame();
    await device.stop();

    await expect(startPromise).rejects.toBeInstanceOf(DeviceStartError);
    await expect(device.done).resolves.toMatchObject({ kind: "stopped" });
    expect(device.status).toBe("stopped");
  });

  it("reports a fatal acknowledgement error without reconnecting forever", async () => {
    const fixture = await useFixture({ avlAcknowledgementCount: 0 });
    const device = new Device({
      imei: "123456789012345",
      host: fixture.host,
      port: fixture.port,
      route: presets.routes.rotterdamWarsaw,
      intervalMs: 5,
      packetCount: 1,
    });
    const failures: Error[] = [];
    device.on("failed", ({ error }) => failures.push(error));

    await device.start();
    await expect(device.done).resolves.toMatchObject({ kind: "failed" });
    expect(device.status).toBe("failed");
    expect(failures[0]?.message).toMatch(/acknowledgement count mismatch/i);
  });

  it("resumes from a snapshot and requires reset after a completed run", async () => {
    const fixture = await useFixture();
    const first = new Device({
      imei: "123456789012345",
      host: fixture.host,
      port: fixture.port,
      route: presets.routes.rotterdamWarsaw,
      intervalMs: 5,
      packetCount: 1,
    });

    await first.start();
    await expect(first.done).resolves.toMatchObject({ kind: "completed" });
    const snapshot = first.getSnapshot();
    expect(snapshot?.acceptedRecordCount).toBe(1);

    const resumed = new Device({
      imei: "123456789012345",
      host: fixture.host,
      port: fixture.port,
      route: presets.routes.rotterdamWarsaw,
      intervalMs: 5,
      packetCount: 2,
      resumeFrom: snapshot,
    });

    await resumed.start();
    await expect(resumed.done).resolves.toMatchObject({ kind: "completed" });
    expect(resumed.getSnapshot()?.acceptedRecordCount).toBe(2);
    await expect(resumed.start()).rejects.toBeInstanceOf(DeviceStateError);

    resumed.reset();
    expect(resumed.status).toBe("idle");
  });

  it("validates configuration before opening a socket", () => {
    expect(() => new Device({
      imei: "invalid",
      host: "127.0.0.1",
      port: 5027,
      route: presets.routes.rotterdamWarsaw,
    })).toThrow(/imei/);

    expect(() => new Device({
      imei: "123456789012345",
      host: "127.0.0.1",
      port: 5027,
      route: { metadata: { id: "empty" }, points: [] },
    })).toThrow();
  });

  async function useFixture(options: Parameters<typeof startTeltonikaParserFixture>[0] = {}) {
    const fixture = await startTeltonikaParserFixture(options);
    fixtures.push(fixture);
    return fixture;
  }
});
