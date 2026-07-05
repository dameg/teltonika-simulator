import type { DrivingStyleName, DrivingStyleProfile } from "./domain";

export const drivingStyleProfiles = {
  eco: {
    name: "eco",
    targetAccelerationMps2: 0.8,
    brakingIntensityMps2: 1.2,
    speedVariationRatio: 0.06,
    idleProbability: 0.02,
    corneringSlowdownRatio: 0.85,
    harshAccelerationProbability: 0.005,
    harshBrakingProbability: 0.005
  },
  normal: {
    name: "normal",
    targetAccelerationMps2: 1.4,
    brakingIntensityMps2: 2,
    speedVariationRatio: 0.12,
    idleProbability: 0.04,
    corneringSlowdownRatio: 0.75,
    harshAccelerationProbability: 0.02,
    harshBrakingProbability: 0.025
  },
  aggressive: {
    name: "aggressive",
    targetAccelerationMps2: 2.3,
    brakingIntensityMps2: 3.2,
    speedVariationRatio: 0.22,
    idleProbability: 0.01,
    corneringSlowdownRatio: 0.6,
    harshAccelerationProbability: 0.08,
    harshBrakingProbability: 0.09
  }
} satisfies Record<DrivingStyleName, DrivingStyleProfile>;

export function parseDrivingStyleName(value: string): DrivingStyleName {
  if (isDrivingStyleName(value)) {
    return value;
  }
  throw new Error("Invalid driving-style: expected eco, normal, or aggressive.");
}

export function getDrivingStyleProfile(name: string): DrivingStyleProfile {
  return drivingStyleProfiles[parseDrivingStyleName(name)];
}

function isDrivingStyleName(value: string): value is DrivingStyleName {
  return value === "eco" || value === "normal" || value === "aggressive";
}
