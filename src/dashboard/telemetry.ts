import type { AvlRecord } from "../domain";
import type {
  DashboardTelemetryField,
  DashboardTelemetryGroup,
  DashboardTelemetrySnapshot,
  DashboardTelemetryValue,
} from "./domain";

type TelemetryGroupKey = "gps" | "status" | "engine" | "fuelDistance" | "power";

interface IoParameterDefinition {
  key: string;
  label: string;
  group: TelemetryGroupKey;
  unit?: string;
  format(value: number | bigint): { value: DashboardTelemetryValue; displayValue: string };
}

const groupDefinitions: readonly { key: TelemetryGroupKey; label: string }[] = [
  { key: "gps", label: "GPS" },
  { key: "status", label: "Status and movement" },
  { key: "engine", label: "Engine" },
  { key: "fuelDistance", label: "Fuel and distance" },
  { key: "power", label: "Power" },
];

const ioParameters: Readonly<Record<number, IoParameterDefinition>> = {
  66: numeric("externalVoltage", "External voltage", "power", "V", (value) => value / 1_000, 3),
  67: numeric("batteryVoltage", "Battery voltage", "power", "V", (value) => value / 1_000, 3),
  69: booleanParameter("gpsFix", "GPS fix", "status", "Available", "Unavailable"),
  79: booleanParameter("brakeSwitch", "Brake pedal", "status", "Pressed", "Released"),
  80: numeric("wheelBasedSpeed", "Wheel-based speed", "engine", "km/h"),
  81: booleanParameter("cruiseControl", "Cruise control", "status", "On", "Off"),
  82: booleanParameter("clutchSwitch", "Clutch pedal", "status", "Pressed", "Released"),
  83: enumParameter("ptoState", "PTO", "status", { 0: "Off", 1: "On", 2: "Unavailable" }),
  84: numeric("acceleratorPedal", "Accelerator pedal", "engine", "%"),
  85: numeric("engineLoad", "Engine load", "engine", "%"),
  86: numeric("totalFuelUsed", "Total fuel used", "fuelDistance", "L"),
  87: numeric("fuelLevel", "Fuel level", "fuelDistance", "%"),
  88: numeric("engineSpeed", "Engine speed", "engine", "rpm"),
  89: numeric("axleWeight1", "Axle 1 weight", "engine", "kg"),
  90: numeric("axleWeight2", "Axle 2 weight", "engine", "kg"),
  91: numeric("axleWeight3", "Axle 3 weight", "engine", "kg"),
  192: numeric("totalOdometer", "Total odometer", "fuelDistance", "km", (value) => value / 1_000, 3),
  193: numeric("tripDistance", "Trip distance", "fuelDistance", "km", (value) => value / 1_000, 3),
  239: booleanParameter("ignition", "Ignition", "status", "On", "Off"),
  240: booleanParameter("movement", "Movement", "status", "Moving", "Stopped"),
  251: booleanParameter("idling", "Idling", "status", "Idling", "Not idling"),
  253: enumParameter("drivingEvent", "Driving event", "status", {
    0: "None",
    1: "Harsh acceleration",
    2: "Harsh braking",
  }),
};

export function createDashboardTelemetry(record: AvlRecord): DashboardTelemetrySnapshot {
  const groups = new Map<TelemetryGroupKey, DashboardTelemetryField[]>();
  const add = (group: TelemetryGroupKey, field: DashboardTelemetryField) => {
    const fields = groups.get(group) ?? [];
    fields.push(field);
    groups.set(group, fields);
  };

  add("gps", field("timestamp", "Timestamp", record.timestampMs, new Date(record.timestampMs).toISOString()));
  add("gps", field("latitude", "Latitude", record.gps.latitude / 10_000_000, formatCoordinate(record.gps.latitude)));
  add("gps", field("longitude", "Longitude", record.gps.longitude / 10_000_000, formatCoordinate(record.gps.longitude)));
  add("gps", field("altitude", "Altitude", record.gps.altitudeMeters, `${record.gps.altitudeMeters} m`, "m"));
  add("gps", field("heading", "Heading", record.gps.headingDegrees, `${record.gps.headingDegrees}°`, "°"));
  add("gps", field("satellites", "Satellites", record.gps.satellites, String(record.gps.satellites)));
  add("gps", field("speed", "GPS speed", record.gps.speedKph, `${record.gps.speedKph} km/h`, "km/h"));

  for (const element of numericIoElements(record)) {
    const definition = ioParameters[element.id];
    if (!definition) {
      continue;
    }

    const formatted = definition.format(element.value);
    add(definition.group, {
      key: definition.key,
      label: definition.label,
      value: formatted.value,
      displayValue: formatted.displayValue,
      unit: definition.unit,
      ioId: element.id,
    });
  }

  return {
    groups: groupDefinitions.flatMap((group) => {
      const fields = groups.get(group.key);
      return fields && fields.length > 0
        ? [{ key: group.key, label: group.label, fields } satisfies DashboardTelemetryGroup]
        : [];
    }),
  };
}

function numericIoElements(record: AvlRecord): Array<{ id: number; value: number | bigint }> {
  return [
    ...record.io.oneByte,
    ...record.io.twoBytes,
    ...record.io.fourBytes,
    ...record.io.eightBytes,
  ];
}

function field(
  key: string,
  label: string,
  value: DashboardTelemetryValue,
  displayValue: string,
  unit?: string,
): DashboardTelemetryField {
  return { key, label, value, displayValue, unit };
}

function numeric(
  key: string,
  label: string,
  group: TelemetryGroupKey,
  unit?: string,
  convert: (value: number) => number = (value) => value,
  maximumFractionDigits = 1,
): IoParameterDefinition {
  return {
    key,
    label,
    group,
    unit,
    format(rawValue) {
      const value = convert(Number(rawValue));
      const formatted = new Intl.NumberFormat("en-US", {
        maximumFractionDigits,
      }).format(value);
      return { value, displayValue: unit ? `${formatted} ${unit}` : formatted };
    },
  };
}

function booleanParameter(
  key: string,
  label: string,
  group: TelemetryGroupKey,
  trueLabel: string,
  falseLabel: string,
): IoParameterDefinition {
  return {
    key,
    label,
    group,
    format(rawValue) {
      const value = Number(rawValue) !== 0;
      return { value, displayValue: value ? trueLabel : falseLabel };
    },
  };
}

function enumParameter(
  key: string,
  label: string,
  group: TelemetryGroupKey,
  labels: Readonly<Record<number, string>>,
): IoParameterDefinition {
  return {
    key,
    label,
    group,
    format(rawValue) {
      const value = Number(rawValue);
      return { value, displayValue: labels[value] ?? `Unknown (${value})` };
    },
  };
}

function formatCoordinate(value: number): string {
  return (value / 10_000_000).toFixed(7);
}
