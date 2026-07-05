import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { crc16Ibm, createDryRunOutput, parseConfig, runCli } from "../src";

const routeFile = join(__dirname, "fixtures", "city-loop.route.json");
const baseArgs = [
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
  "--dry-run"
];

describe("dry-run packet output", () => {
  it("produces identical packet hex for the same route, style, seed, interval, and count", () => {
    const first = createDryRunOutput(configArgs(["--driving-style", "normal"]));
    const second = createDryRunOutput(configArgs(["--driving-style", "normal"]));

    expect(first.stdoutLines).toEqual(second.stdoutLines);
  });

  it("produces different packet sequences for different driving styles", () => {
    const eco = createDryRunOutput(configArgs(["--driving-style", "eco"]));
    const aggressive = createDryRunOutput(configArgs(["--driving-style", "aggressive"]));

    expect(eco.stdoutLines).not.toEqual(aggressive.stdoutLines);
  });

  it("emits valid Codec 8 Extended framed packets", () => {
    const output = createDryRunOutput(configArgs(["--driving-style", "normal"]));

    for (const line of output.stdoutLines) {
      const packet = Buffer.from(line, "hex");
      const dataLength = packet.readUInt32BE(4);
      const dataField = packet.subarray(8, 8 + dataLength);

      expect(packet.subarray(0, 4)).toEqual(Buffer.alloc(4));
      expect(dataLength).toBe(packet.byteLength - 12);
      expect(dataField[0]).toBe(0x8e);
      expect(dataField[1]).toBe(1);
      expect(dataField[dataField.length - 1]).toBe(1);
      expect(packet.readUInt32BE(8 + dataLength)).toBe(crc16Ibm(dataField));
    }
  });

  it("writes only hex packets to stdout and keeps context on stderr", async () => {
    const stdout = capture();
    const stderr = capture();

    const exitCode = await runCli([...baseArgs, "--driving-style", "normal"], {}, { stdout, stderr });

    expect(exitCode).toBe(0);
    expect(stdout.text().trim().split("\n")).toHaveLength(2);
    expect(stdout.lines().every((line) => /^[0-9a-f]+$/.test(line))).toBe(true);
    expect(stderr.text()).toContain("dry-run route=city-loop");
    expect(stderr.text()).toContain("imei=123456789012345");
  });

  it("keeps dry-run modules independent from net and session startup", () => {
    const dryRunSource = readFileSync("src/dry-run.ts", "utf8");

    expect(dryRunSource).not.toMatch(/^\s*import .*["'](?:node:net|net)["']/m);
    expect(dryRunSource).not.toMatch(/^\s*import .*["'].*(?:tcp|session).*["']/im);
  });

  it("fails clearly when live mode is asked to run more than one IMEI", async () => {
    await expect(
      runCli(
        [
          "--host",
          "127.0.0.1",
          "--port",
          "5027",
          "--imei",
          "123456789012345",
          "--imei",
          "123456789012346"
        ],
        {},
        { stdout: capture(), stderr: capture() }
      )
    ).rejects.toThrow("Live runtime currently supports exactly one IMEI. Use one --imei or --dry-run.");
  });
});

function configArgs(extraArgs: string[]) {
  const result = createConfig([...baseArgs, ...extraArgs]);
  return result;
}

function createConfig(argv: string[]) {
  const result = parseConfig(argv, {});
  if (result.kind !== "config") {
    throw new Error("expected config");
  }
  return result.config;
}

function capture() {
  let value = "";
  return {
    write(chunk: string) {
      value += chunk;
      return true;
    },
    text() {
      return value;
    },
    lines() {
      return value.trim().split("\n").filter(Boolean);
    }
  };
}
