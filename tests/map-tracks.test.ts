import { describe, expect, it } from "vitest";

import { visibleTrackImeis } from "../src/dashboard/frontend/map-tracks";

describe("map tracks", () => {
  it("shows every device track until one device is selected", () => {
    const positions = [{ imei: "111" }, { imei: "222" }, { imei: "111" }];

    expect(visibleTrackImeis(positions, "")).toEqual(["111", "222"]);
    expect(visibleTrackImeis(positions, "222")).toEqual(["222"]);
  });
});
