import type { SimulatorConfig } from "../config";

export type DashboardRunStatus =
  | "configured"
  | "starting"
  | "running"
  | "reconnecting"
  | "stopped"
  | "rejected"
  | "failed"
  | "completed";

export type DashboardLogSeverity = "debug" | "info" | "warn" | "error";

export type DashboardLogEventType =
  | "deviceCreated"
  | "deviceUpdated"
  | "deviceDeleted"
  | "simulationStartRequested"
  | "simulationStopRequested"
  | "tcpConnected"
  | "imeiSent"
  | "imeiAccepted"
  | "imeiRejected"
  | "avlPacketSent"
  | "avlAcknowledged"
  | "reconnectAttempted"
  | "runCompleted"
  | "runStopped"
  | "runFailed";

export type DashboardDeviceConfig = Pick<
  SimulatorConfig,
  | "host"
  | "port"
  | "intervalMs"
  | "reconnectDelayMs"
  | "routeFile"
  | "drivingStyle"
  | "seed"
  | "deviceProfile"
  | "packetCount"
>;

export interface DashboardDeviceRecord {
  imei: string;
  label: string;
  enabled: boolean;
  config: DashboardDeviceConfig;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface DashboardRunRecord {
  imei: string;
  status: DashboardRunStatus;
  updatedAtMs: number;
  runId?: string;
  lastStartAtMs?: number;
  lastStopAtMs?: number;
  lastError?: string;
}

export interface DashboardRunOverview {
  total: number;
  counts: Record<DashboardRunStatus, number>;
}

export type DashboardLogContextValue = boolean | number | string | null;

export interface DashboardLogEvent {
  id: string;
  imei?: string;
  severity: DashboardLogSeverity;
  type: DashboardLogEventType;
  message: string;
  timestampMs: number;
  context?: Record<string, DashboardLogContextValue>;
}

export type DashboardDomainErrorCode =
  | "EMPTY_IMEI"
  | "INVALID_IMEI"
  | "DUPLICATE_IMEI"
  | "DEVICE_NOT_FOUND"
  | "RUN_NOT_FOUND";

export class DashboardDomainError extends Error {
  readonly code: DashboardDomainErrorCode;

  constructor(code: DashboardDomainErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "DashboardDomainError";
  }
}

export function normalizeImei(value: string): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new DashboardDomainError("EMPTY_IMEI", "IMEI is required");
  }

  if (!/^\d{15}$/.test(normalized)) {
    throw new DashboardDomainError(
      "INVALID_IMEI",
      "IMEI must contain exactly 15 digits"
    );
  }

  return normalized;
}

export function assertUniqueImei(
  imei: string,
  existingImeis: Iterable<string>
): string {
  const normalized = normalizeImei(imei);

  for (const existingImei of existingImeis) {
    if (normalizeImei(existingImei) === normalized) {
      throw new DashboardDomainError(
        "DUPLICATE_IMEI",
        `IMEI already exists: ${normalized}`
      );
    }
  }

  return normalized;
}

export function findDuplicateImeis(imeis: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const imei of imeis) {
    const normalized = normalizeImei(imei);

    if (seen.has(normalized)) {
      duplicates.add(normalized);
      continue;
    }

    seen.add(normalized);
  }

  return [...duplicates];
}
