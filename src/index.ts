import { parseConfig } from "./config";

export { helpText, parseConfig } from "./config";
export { toTeltonikaLatitude, toTeltonikaLongitude } from "./domain";
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
  RouteDefinition,
  RouteMetadata,
  RoutePoint,
  TeltonikaCoordinate,
  VehiclePosition,
  VehicleState,
  VehicleStateField
} from "./domain";

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
