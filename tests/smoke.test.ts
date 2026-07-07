import { describe, expect, it } from "vitest";

import { runCli, simulatorName } from "../src";

describe("project bootstrap", () => {
  it("loads the TypeScript entry point", () => {
    expect(simulatorName()).toBe("teltonika-simulator");
  });

  it("keeps the CLI help available after splitting the entry point", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runCli(["--help"], {}, {
      stdout: {
        write(chunk: string | Uint8Array) {
          stdout.push(String(chunk));
          return true;
        },
      },
      stderr: {
        write(chunk: string | Uint8Array) {
          stderr.push(String(chunk));
          return true;
        },
      },
    });

    expect(exitCode).toBe(0);
    expect(stdout.join("\n")).toContain("Usage:");
    expect(stdout.join("\n")).toContain("dashboard");
    expect(stdout.join("\n")).toContain("Start the NestJS dashboard shell");
    expect(stderr).toEqual([]);
  });
});
