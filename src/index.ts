import { parseConfig } from "./config";

export { helpText, parseConfig } from "./config";
export {
  defaultCodec8ExtendedDeviceProfile,
  deviceProfiles,
  getDeviceProfile,
  validateDeviceProfile
} from "./device-profile";
export { drivingStyleProfiles, getDrivingStyleProfile, parseDrivingStyleName } from "./driving-style";
export {
  createDeterministicSimulationContext,
  createSeededRandom,
  createSimulationClock,
  createVehicleSimulator,
  simulationDeterminismKey
} from "./simulation";
export { toTeltonikaLatitude, toTeltonikaLongitude } from "./domain";
export { buildRouteGeometry, interpolateRoutePosition, interpolateRouteProgress, loadRouteFromFile, parseRouteDefinition } from "./route";
export type {
  AvlGpsElement,
  AvlIoElement,
  AvlIoGroups,
  AvlPriority,
  AvlRecord,
  CodecName,
  DeviceIoMappingRule,
  DeviceProfile,
  DeviceProfileDefaults,
  DrivingEvent,
  DrivingEventType,
  DrivingStyleName,
  DrivingStyleProfile,
  InterpolatedRoutePosition,
  RouteDefinition,
  RouteGeometry,
  RouteMetadata,
  RoutePoint,
  RouteSegment,
  TeltonikaCoordinate,
  VehiclePosition,
  VehicleState,
  VehicleStateField
} from "./domain";
export type {
  DeterministicSimulationContext,
  DeterministicSimulationOptions,
  SeededRandom,
  SimulationClock,
  SimulationClockOptions,
  VehicleSimulator,
  VehicleSimulatorOptions
} from "./simulation";

export function simulatorName(): string {
  return "teltonika-simulator";
}

if (require.main === module) {
  try {
    const result = parseConfig();
    if (result.kind === "help") {
      console.log(result.help);
      process.exit(0);
    }

    console.log(JSON.stringify(result.config, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
