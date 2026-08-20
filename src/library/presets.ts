import barcelonaMilanRoute from "../../routes/barcelona-milan.route.json";
import gdanskViennaRoute from "../../routes/gdansk-vienna.route.json";
import rotterdamGenoaRoute from "../../routes/rotterdam-genoa.route.json";
import rotterdamWarsawRoute from "../../routes/rotterdam-warsaw.route.json";
import strasbourgBudapestRoute from "../../routes/strasbourg-budapest.route.json";

import type { DrivingStyleName, RouteDefinition } from "../domain";
import { parseRouteDefinition } from "../route";

function route(value: unknown): RouteDefinition {
  return parseRouteDefinition(value);
}

export const presets = {
  routes: {
    barcelonaMilan: route(barcelonaMilanRoute),
    gdanskVienna: route(gdanskViennaRoute),
    rotterdamGenoa: route(rotterdamGenoaRoute),
    rotterdamWarsaw: route(rotterdamWarsawRoute),
    strasbourgBudapest: route(strasbourgBudapestRoute),
  },
  drivingStyles: {
    eco: "eco",
    normal: "normal",
    aggressive: "aggressive",
  } satisfies Record<DrivingStyleName, DrivingStyleName>,
  deviceProfiles: {
    defaultCodec8e: "default-codec8e",
    fmc003: "fmc003",
    fmc150: "fmc150",
    fmc250: "fmc250",
    fmc650Fms: "fmc650-fms",
  } as const,
} as const;

export type RoutePresetName = keyof typeof presets.routes;
export type DrivingStylePresetName = keyof typeof presets.drivingStyles;
export type DeviceProfilePresetName = keyof typeof presets.deviceProfiles;
