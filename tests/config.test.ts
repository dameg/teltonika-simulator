import { describe, expect, it } from "vitest";

import { parseConfig } from "../src";

const requiredArgs = ["--host", "127.0.0.1", "--port", "5027", "--imei", "123456789012345"];

describe("configuration parsing", () => {
  it("parses host, port, and repeated IMEI flags", () => {
    const result = parseConfig([...requiredArgs, "--imei", "123456789012346"], {});

    expect(result.kind).toBe("config");
    if (result.kind !== "config") {
      throw new Error("expected config");
    }
    expect(result.config).toMatchObject({
      host: "127.0.0.1",
      port: 5027,
      imeis: ["123456789012345", "123456789012346"]
    });
  });

  it("uses environment variables", () => {
    const result = parseConfig([], {
      TELTONIKA_HOST: "parser.local",
      TELTONIKA_PORT: "5027",
      TELTONIKA_IMEIS: "123456789012345,123456789012346",
      TELTONIKA_INTERVAL_MS: "2000",
      TELTONIKA_RECONNECT_DELAY_MS: "3000",
      TELTONIKA_ROUTE_FILE: "route.json",
      TELTONIKA_DRIVING_STYLE: "eco",
      TELTONIKA_SEED: "42",
      TELTONIKA_DEVICE_PROFILE: "fmb920",
      TELTONIKA_DRY_RUN: "true",
      TELTONIKA_PACKET_COUNT: "2"
    });

    if (result.kind !== "config") {
      throw new Error("expected config");
    }
    expect(result.config).toEqual({
      host: "parser.local",
      port: 5027,
      imeis: ["123456789012345", "123456789012346"],
      intervalMs: 2000,
      reconnectDelayMs: 3000,
      routeFile: "route.json",
      drivingStyle: "eco",
      seed: 42,
      deviceProfile: "fmb920",
      dryRun: true,
      packetCount: 2
    });
  });

  it("lets CLI flags override environment variables", () => {
    const result = parseConfig(requiredArgs, {
      TELTONIKA_HOST: "env.local",
      TELTONIKA_PORT: "1",
      TELTONIKA_IMEIS: "999"
    });

    if (result.kind !== "config") {
      throw new Error("expected config");
    }
    expect(result.config).toMatchObject({
      host: "127.0.0.1",
      port: 5027,
      imeis: ["123456789012345"]
    });
  });

  it.each([
    ["port", ["--port", "70000"]],
    ["interval", ["--interval-ms", "0"]],
    ["reconnect delay", ["--reconnect-delay-ms", "0"]],
    ["driving style", ["--driving-style", "wild"]],
    ["seed", ["--seed", "-1"]]
  ])("fails clearly for invalid %s", (_name, args) => {
    expect(() => parseConfig([...requiredArgs, ...args], {})).toThrow(/Invalid/);
  });

  it("fails clearly when IMEI is missing", () => {
    expect(() => parseConfig(["--host", "127.0.0.1", "--port", "5027"], {})).toThrow(/IMEI/);
  });

  it("returns help without requiring configuration", () => {
    const result = parseConfig(["--help"], {});

    expect(result.kind).toBe("help");
    if (result.kind !== "help") {
      throw new Error("expected help");
    }
    expect(result.help).toContain("Usage:");
  });

  it("parses --count as packetCount", () => {
    const result = parseConfig([...requiredArgs, "--dry-run", "--count", "2"], {});

    if (result.kind !== "config") {
      throw new Error("expected config");
    }
    expect(result.config).toMatchObject({
      dryRun: true,
      packetCount: 2
    });
  });
});
