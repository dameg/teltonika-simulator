export const tripInactivityMs = 30 * 60 * 1_000;

export type TripTransition =
  | "close"
  | "continue"
  | "continue-and-close"
  | "none"
  | "rollover"
  | "start";

export interface TripTransitionInput {
  currentLastTimestampMs: number | null;
  ignition: boolean | undefined;
  recordTimestampMs: number;
}

export function determineTripTransition(input: TripTransitionInput): TripTransition {
  if (input.currentLastTimestampMs === null) {
    return input.ignition === false ? "none" : "start";
  }

  if (input.recordTimestampMs - input.currentLastTimestampMs >= tripInactivityMs) {
    return input.ignition === false ? "close" : "rollover";
  }

  return input.ignition === false ? "continue-and-close" : "continue";
}
