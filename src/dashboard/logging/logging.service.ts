import { BadRequestException, Inject, Injectable } from "@nestjs/common";

import {
  type DashboardLogEventType,
  type DashboardLogSeverity,
} from "../domain";
import {
  type DashboardLogQuery,
  InMemoryDashboardDeviceRepository,
  InMemoryDashboardLogRepository,
} from "../repositories";

interface LoggingQueryInput {
  imei?: string;
  severity?: string;
  type?: string;
  limit?: string;
}

const logSeverities = new Set<DashboardLogSeverity>(["debug", "info", "warn", "error"]);
const logEventTypes = new Set<DashboardLogEventType>([
  "deviceCreated",
  "deviceUpdated",
  "deviceDeleted",
  "simulationStartRequested",
  "simulationStopRequested",
  "tcpConnected",
  "imeiSent",
  "imeiAccepted",
  "imeiRejected",
  "avlPacketSent",
  "avlAcknowledged",
  "reconnectAttempted",
  "runCompleted",
  "runStopped",
  "runFailed",
]);

@Injectable()
export class LoggingService {
  constructor(
    @Inject(InMemoryDashboardLogRepository)
    private readonly logRepository: InMemoryDashboardLogRepository,
    @Inject(InMemoryDashboardDeviceRepository)
    private readonly deviceRepository: InMemoryDashboardDeviceRepository,
  ) {}

  listEvents(input: LoggingQueryInput) {
    const query = this.parseQuery(input);
    if (query.imei) {
      this.assertDeviceExists(query.imei);
    }

    return this.logRepository.list(query);
  }

  clearAllEvents(): void {
    this.logRepository.clear();
  }

  clearDeviceEvents(imei: string): void {
    this.assertDeviceExists(imei);
    this.logRepository.clearByDevice(imei);
  }

  private parseQuery(input: LoggingQueryInput): DashboardLogQuery {
    const limit =
      input.limit === undefined || input.limit === ""
        ? undefined
        : parseLimit(input.limit);

    const severity =
      input.severity === undefined || input.severity === ""
        ? undefined
        : parseSeverity(input.severity);

    const type =
      input.type === undefined || input.type === ""
        ? undefined
        : parseType(input.type);

    return {
      imei: input.imei,
      severity,
      type,
      limit,
    };
  }

  private assertDeviceExists(imei: string): void {
    if (!this.deviceRepository.get(imei)) {
      throw new Error(`Device not found: ${imei}`);
    }
  }
}

function parseLimit(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw invalidRequest("Query parameter 'limit' must be a positive integer.");
  }

  return parsed;
}

function parseSeverity(value: string): DashboardLogSeverity {
  if (!logSeverities.has(value as DashboardLogSeverity)) {
    throw invalidRequest("Query parameter 'severity' is invalid.");
  }

  return value as DashboardLogSeverity;
}

function parseType(value: string): DashboardLogEventType {
  if (!logEventTypes.has(value as DashboardLogEventType)) {
    throw invalidRequest("Query parameter 'type' is invalid.");
  }

  return value as DashboardLogEventType;
}

function invalidRequest(message: string): BadRequestException {
  return new BadRequestException({
    error: {
      code: "INVALID_REQUEST",
      message,
    },
  });
}
