import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { drivingStyleProfiles, getDrivingStyleProfile, parseDrivingStyleName } from "../src";

describe("driving-style profiles", () => {
  it("provides the MVP profiles by name", () => {
    expect(Object.keys(drivingStyleProfiles)).toEqual(["eco", "normal", "aggressive"]);
    expect(getDrivingStyleProfile("eco").name).toBe("eco");
    expect(getDrivingStyleProfile("normal").name).toBe("normal");
    expect(getDrivingStyleProfile("aggressive").name).toBe("aggressive");
  });

  it("rejects invalid profile names clearly", () => {
    expect(() => parseDrivingStyleName("wild")).toThrow("Invalid driving-style: expected eco, normal, or aggressive.");
    expect(() => getDrivingStyleProfile("")).toThrow("Invalid driving-style");
  });

  it("uses observably different behavior settings per profile", () => {
    const { eco, normal, aggressive } = drivingStyleProfiles;

    expect([eco.targetAccelerationMps2, normal.targetAccelerationMps2, aggressive.targetAccelerationMps2]).toEqual([0.8, 1.4, 2.3]);
    expect([eco.brakingIntensityMps2, normal.brakingIntensityMps2, aggressive.brakingIntensityMps2]).toEqual([1.2, 2, 3.2]);
    expect([eco.speedVariationRatio, normal.speedVariationRatio, aggressive.speedVariationRatio]).toEqual([0.06, 0.12, 0.22]);
    expect([eco.idleProbability, normal.idleProbability, aggressive.idleProbability]).toEqual([0.02, 0.04, 0.01]);
    expect([eco.corneringSlowdownRatio, normal.corneringSlowdownRatio, aggressive.corneringSlowdownRatio]).toEqual([0.85, 0.75, 0.6]);
    expect([eco.harshAccelerationProbability, normal.harshAccelerationProbability, aggressive.harshAccelerationProbability]).toEqual([
      0.005,
      0.02,
      0.08
    ]);
    expect([eco.harshBrakingProbability, normal.harshBrakingProbability, aggressive.harshBrakingProbability]).toEqual([0.005, 0.025, 0.09]);
  });

  it("keeps profiles independent from route geometry, TCP, and packet encoding modules", () => {
    const source = readFileSync("src/driving-style.ts", "utf8");

    expect(source).not.toMatch(/^\s*import .*["'](?:node:net|net)["']/m);
    expect(source).not.toMatch(/^\s*import .*["'].*(?:route|codec|packet|encoder).*["']/im);
  });
});
