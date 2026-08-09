import { memo, type ReactElement } from "react";

export interface TelemetryField {
  key: string;
  label: string;
  value: boolean | number | string;
  displayValue: string;
  unit?: string;
  ioId?: number;
}

export interface TelemetryGroup {
  key: string;
  label: string;
  fields: TelemetryField[];
}

export interface TelemetrySnapshot {
  groups: TelemetryGroup[];
}

interface TelemetrySummaryProps {
  telemetry: TelemetrySnapshot;
}

export const TelemetrySummary = memo(function TelemetrySummary({
  telemetry,
}: TelemetrySummaryProps): ReactElement | null {
  if (telemetry.groups.length === 0) return null;

  return (
    <div className="telemetry-summary" aria-label="Vehicle telemetry">
      {telemetry.groups.map((group) => (
        <section key={group.key} className="telemetry-group">
          <h4>{group.label}</h4>
          <dl>
            {group.fields.map((field) => (
              <div key={field.key} className="telemetry-field" title={field.ioId === undefined ? undefined : `Teltonika IO ID ${field.ioId}`}>
                <dt>{field.label}</dt>
                <dd>{field.displayValue}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
});
