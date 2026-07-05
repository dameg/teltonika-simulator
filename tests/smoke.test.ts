import { describe, expect, it } from "vitest";

import { simulatorName } from "../src";

describe("project bootstrap", () => {
  it("loads the TypeScript entry point", () => {
    expect(simulatorName()).toBe("teltonika-simulator");
  });
});
