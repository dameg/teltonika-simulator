import { describe, expect, it } from "vitest";

import {
  DashboardDomainError,
  assertUniqueImei,
  findDuplicateImeis,
  normalizeImei,
} from "../src";

describe("dashboard domain", () => {
  it("normalizes valid IMEIs", () => {
    expect(normalizeImei(" 123456789012345 ")).toBe("123456789012345");
  });

  it("rejects empty and malformed IMEIs", () => {
    expect(() => normalizeImei("   ")).toThrowError(DashboardDomainError);
    expect(() => normalizeImei("abc")).toThrow(/15 digits/);
    expect(() => normalizeImei("12345678901234")).toThrow(/15 digits/);
  });

  it("rejects duplicates through shared validation", () => {
    expect(() =>
      assertUniqueImei("123456789012345", ["123456789012345"])
    ).toThrow(/already exists/);
  });

  it("finds normalized duplicates", () => {
    expect(
      findDuplicateImeis([
        "123456789012345",
        " 123456789012345 ",
        "123456789012346",
      ])
    ).toEqual(["123456789012345"]);
  });
});
