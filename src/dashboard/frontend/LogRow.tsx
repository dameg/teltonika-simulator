import { Badge, Box, Group, Text } from "@mantine/core";
import { memo, type ReactElement } from "react";

import { TelemetrySummary, type TelemetrySnapshot } from "./TelemetrySummary";

export type LogSeverity = "debug" | "info" | "warn" | "error";

export interface FrontendLogEvent {
  id: string;
  imei?: string;
  severity: LogSeverity;
  type: string;
  message: string;
  timestampMs: number;
  data?: unknown;
  telemetry?: TelemetrySnapshot;
}

interface LogRowProps {
  log: FrontendLogEvent;
}

export const LogRow = memo(function LogRow({ log }: LogRowProps): ReactElement {
  return (
    <Box className="log-row">
      <Group gap="xs" wrap="nowrap">
        <Text size="xs" c="dimmed" className="log-time">{formatTime(log.timestampMs)}</Text>
        <Badge size="xs" variant="light" color={severityColor(log.severity)}>{log.severity}</Badge>
        <Text size="sm" fw={600}>{log.type}</Text>
      </Group>
      <Text size="sm" c="dimmed" mt={5}>{log.message}</Text>
      {log.telemetry ? <TelemetrySummary telemetry={log.telemetry} /> : null}
      {log.data !== undefined ? (
        <details>
          <summary>JSON package</summary>
          <pre>{JSON.stringify(log.data, null, 2)}</pre>
        </details>
      ) : null}
    </Box>
  );
});

function formatTime(value: number): string {
  return new Date(value).toLocaleTimeString();
}

function severityColor(severity: LogSeverity): string {
  return severity === "error" ? "red" : severity === "warn" ? "orange" : severity === "info" ? "blue" : "gray";
}
