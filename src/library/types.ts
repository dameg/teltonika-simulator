import type { AvlRecord, DrivingStyleName, RouteDefinition } from "../domain";
import type {
  LiveSessionConfiguration,
  LiveSessionRecordAcceptedContext,
} from "../live-session";
import type { VehicleSimulatorCheckpoint } from "../simulation";

export type DeviceStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "stopping"
  | "stopped"
  | "rejected"
  | "completed"
  | "failed";

export interface DeviceSnapshot {
  checkpoint: VehicleSimulatorCheckpoint;
  acceptedRecordCount: number;
}

export interface DeviceOptions {
  imei: string;
  host: string;
  port: number;
  route: RouteDefinition;
  intervalMs?: number;
  reconnectDelayMs?: number;
  drivingStyle?: DrivingStyleName;
  deviceProfile?: string;
  seed?: number;
  simulationSpeed?: number;
  packetCount?: number;
  resumeFrom?: DeviceSnapshot;
}

export interface DeviceUpdate {
  intervalMs?: number;
  simulationSpeed?: number;
  drivingStyle?: DrivingStyleName;
  deviceProfile?: string;
  seed?: number;
  packetCount?: number;
}

export interface DeviceStatusChangeEvent {
  previousStatus: DeviceStatus;
  status: DeviceStatus;
}

export interface DeviceConnectedEvent {
  host: string;
  port: number;
  imei: string;
}

export interface DeviceReconnectingEvent {
  delayMs: number;
  reason: string;
}

export interface DeviceRecordAcceptedEvent {
  record: AvlRecord;
  packetHex: string;
  context: LiveSessionRecordAcceptedContext;
}

export interface DeviceCompletionEvent {
  snapshot: DeviceSnapshot | undefined;
}

export interface DeviceRejectedEvent {
  error: Error;
}

export interface DeviceFailedEvent {
  error: Error;
}

export interface DeviceEventMap {
  statusChange: DeviceStatusChangeEvent;
  connected: DeviceConnectedEvent;
  reconnecting: DeviceReconnectingEvent;
  recordAccepted: DeviceRecordAcceptedEvent;
  stopped: DeviceCompletionEvent;
  completed: DeviceCompletionEvent;
  rejected: DeviceRejectedEvent;
  failed: DeviceFailedEvent;
}

export type DeviceEventName = keyof DeviceEventMap;

export type DeviceRunResult =
  | { kind: "idle" }
  | { kind: "completed"; snapshot: DeviceSnapshot | undefined }
  | { kind: "stopped"; snapshot: DeviceSnapshot | undefined }
  | { kind: "rejected"; error: Error }
  | { kind: "failed"; error: Error };

export type DeviceConfiguration = Required<
  Pick<
    LiveSessionConfiguration,
    "intervalMs" | "drivingStyle" | "seed" | "deviceProfile"
  >
> & Pick<LiveSessionConfiguration, "simulationSpeed" | "packetCount">;
