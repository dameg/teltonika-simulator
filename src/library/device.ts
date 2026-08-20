import { EventEmitter } from "node:events";

import { parseDrivingStyleName, getDrivingStyleProfile } from "../driving-style";
import { getDeviceProfile } from "../device-profile";
import {
  runLiveSession,
  type LiveSessionEvent,
} from "../live-session";
import { parseRouteDefinition } from "../route";
import { simulationSpeedMultiplier } from "../simulation";
import type { RouteDefinition } from "../domain";
import type {
  DeviceConfiguration,
  DeviceEventMap,
  DeviceEventName,
  DeviceOptions,
  DeviceRunResult,
  DeviceSnapshot,
  DeviceStatus,
  DeviceUpdate,
} from "./types";

export class DeviceConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeviceConfigurationError";
  }
}

export class DeviceStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeviceStateError";
  }
}

export class DeviceImeiRejectedError extends Error {
  constructor(imei: string) {
    super(`Parser rejected IMEI ${imei}`);
    this.name = "DeviceImeiRejectedError";
  }
}

export class DeviceStartError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeviceStartError";
  }
}

type ReadySettlement = {
  settled: boolean;
  resolve(): void;
  reject(error: Error): void;
};

const activeStatuses = new Set<DeviceStatus>([
  "connecting",
  "connected",
  "reconnecting",
  "stopping",
]);

export class Device {
  private readonly emitter = new EventEmitter();
  private readonly route: RouteDefinition;
  private readonly imei: string;
  private readonly host: string;
  private readonly port: number;
  private readonly reconnectDelayMs: number;
  private configuration: DeviceConfiguration;
  private snapshot: DeviceSnapshot | undefined;
  private statusValue: DeviceStatus = "idle";
  private controller: AbortController | undefined;
  private runPromise: Promise<DeviceRunResult> | undefined;
  private lastError: Error | undefined;
  private donePromise: Promise<DeviceRunResult> = Promise.resolve({ kind: "idle" });

  constructor(options: DeviceOptions) {
    this.imei = validateImei(options.imei);
    this.host = validateHost(options.host);
    this.port = validatePort(options.port);
    this.route = parseRouteDefinition(options.route);
    this.reconnectDelayMs = validateNonNegativeInteger(
      options.reconnectDelayMs ?? 5_000,
      "reconnectDelayMs",
    );
    this.configuration = validateConfiguration({
      intervalMs: options.intervalMs ?? 1_000,
      simulationSpeed: options.simulationSpeed ?? 0,
      drivingStyle: options.drivingStyle ?? "normal",
      seed: options.seed ?? 1,
      deviceProfile: options.deviceProfile ?? "default-codec8e",
      packetCount: options.packetCount,
    });
    this.snapshot = options.resumeFrom === undefined
      ? undefined
      : validateSnapshot(options.resumeFrom, this.route.metadata.id);
  }

  get status(): DeviceStatus {
    return this.statusValue;
  }

  get done(): Promise<DeviceRunResult> {
    return this.donePromise;
  }

  on<K extends DeviceEventName>(event: K, listener: (payload: DeviceEventMap[K]) => void): this {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
    return this;
  }

  once<K extends DeviceEventName>(event: K, listener: (payload: DeviceEventMap[K]) => void): this {
    this.emitter.once(event, listener as (...args: unknown[]) => void);
    return this;
  }

  off<K extends DeviceEventName>(event: K, listener: (payload: DeviceEventMap[K]) => void): this {
    this.emitter.off(event, listener as (...args: unknown[]) => void);
    return this;
  }

  async start(): Promise<void> {
    if (activeStatuses.has(this.statusValue)) {
      throw new DeviceStateError("Device is already running");
    }
    if (this.statusValue === "completed" || this.statusValue === "rejected" || this.statusValue === "failed") {
      throw new DeviceStateError("Reset the device before starting a terminal session");
    }
    if (
      this.configuration.packetCount !== undefined &&
      (this.snapshot?.acceptedRecordCount ?? 0) >= this.configuration.packetCount
    ) {
      throw new DeviceStateError("Packet limit has already been reached; reset the device before starting");
    }

    const controller = new AbortController();
    this.controller = controller;
    this.lastError = undefined;
    this.transition("connecting");

    let readyResolve!: () => void;
    let readyReject!: (error: Error) => void;
    const readyPromise = new Promise<void>((resolve, reject) => {
      readyResolve = resolve;
      readyReject = reject;
    });
    const ready: ReadySettlement = {
      settled: false,
      resolve: () => {
        if (!ready.settled) {
          ready.settled = true;
          readyResolve();
        }
      },
      reject: (error) => {
        if (!ready.settled) {
          ready.settled = true;
          readyReject(error);
        }
      },
    };

    const runPromise = this.executeSession(controller, ready);
    this.runPromise = runPromise;
    this.donePromise = runPromise;

    try {
      await readyPromise;
    } catch (error) {
      await runPromise;
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.controller || !this.runPromise) {
      return;
    }

    if (activeStatuses.has(this.statusValue) && this.statusValue !== "stopping") {
      this.transition("stopping");
    }
    this.controller.abort();
    await this.runPromise;
  }

  update(update: DeviceUpdate): void {
    this.configuration = validateConfiguration({
      ...this.configuration,
      ...update,
    });
  }

  getSnapshot(): DeviceSnapshot | undefined {
    return this.snapshot === undefined ? undefined : cloneSnapshot(this.snapshot);
  }

  reset(): void {
    if (activeStatuses.has(this.statusValue)) {
      throw new DeviceStateError("Cannot reset an active device");
    }

    this.snapshot = undefined;
    this.lastError = undefined;
    if (this.statusValue !== "idle") {
      this.transition("idle");
    }
  }

  private async executeSession(controller: AbortController, ready: ReadySettlement): Promise<DeviceRunResult> {
    try {
      const result = await runLiveSession({
        host: this.host,
        port: this.port,
        imei: this.imei,
        intervalMs: this.configuration.intervalMs,
        simulationSpeed: this.configuration.simulationSpeed,
        reconnectDelayMs: this.reconnectDelayMs,
        route: this.route,
        drivingStyle: this.configuration.drivingStyle,
        seed: this.configuration.seed,
        deviceProfile: this.configuration.deviceProfile,
        packetCount: this.configuration.packetCount,
        checkpoint: this.snapshot?.checkpoint,
        acceptedRecordCount: this.snapshot?.acceptedRecordCount,
        signal: controller.signal,
        getCurrentConfiguration: () => ({ ...this.configuration }),
        onEvent: (event) => this.handleLiveSessionEvent(event, ready),
      });

      if (!ready.settled) {
        if (result.kind === "rejected") {
          ready.reject(this.lastError ?? new DeviceImeiRejectedError(this.imei));
        } else {
          ready.reject(new DeviceStartError("Session completed before IMEI acceptance"));
        }
      }

      if (result.kind === "rejected") {
        const error = this.lastError ?? new DeviceImeiRejectedError(this.imei);
        if (this.statusValue !== "rejected") {
          this.transition("rejected");
          this.emit("rejected", { error });
        }
        return { kind: "rejected", error };
      }

      const kind = controller.signal.aborted ? "stopped" : "completed";
      if (this.statusValue !== kind) {
        this.transition(kind);
        this.emit(kind, { snapshot: this.getSnapshot() });
      }
      return { kind, snapshot: this.getSnapshot() };
    } catch (error) {
      const normalizedError = toError(error);
      this.lastError = normalizedError;
      ready.reject(normalizedError);
      this.transition("failed");
      this.emit("failed", { error: normalizedError });
      return { kind: "failed", error: normalizedError };
    } finally {
      if (this.controller === controller) {
        this.controller = undefined;
      }
    }
  }

  private handleLiveSessionEvent(event: LiveSessionEvent, ready: ReadySettlement): void {
    switch (event.kind) {
      case "connecting":
        this.transition("connecting");
        return;
      case "tcpConnected":
      case "imeiSent":
        return;
      case "imeiAccepted":
        this.transition("connected");
        this.emit("connected", {
          host: this.host,
          port: this.port,
          imei: this.imei,
        });
        ready.resolve();
        return;
      case "imeiRejected": {
        const error = new DeviceImeiRejectedError(this.imei);
        this.lastError = error;
        this.transition("rejected");
        this.emit("rejected", { error });
        ready.reject(error);
        return;
      }
      case "reconnecting":
        this.transition("reconnecting");
        this.emit("reconnecting", {
          delayMs: event.delayMs,
          reason: event.reason,
        });
        return;
      case "recordAccepted":
        this.snapshot = {
          checkpoint: { ...event.context.checkpoint },
          acceptedRecordCount: event.context.acceptedRecordCount,
        };
        this.emit("recordAccepted", {
          record: event.record,
          packetHex: event.packetHex,
          context: event.context,
        });
        return;
      case "stopped":
        this.transition("stopped");
        this.emit("stopped", { snapshot: this.getSnapshot() });
        return;
      case "completed":
        this.transition("completed");
        this.emit("completed", { snapshot: this.getSnapshot() });
        return;
    }
  }

  private transition(status: DeviceStatus): void {
    if (this.statusValue === status) {
      return;
    }

    const previousStatus = this.statusValue;
    this.statusValue = status;
    this.emit("statusChange", { previousStatus, status });
  }

  private emit<K extends DeviceEventName>(event: K, payload: DeviceEventMap[K]): void {
    this.emitter.emit(event, payload);
  }
}

function validateConfiguration(configuration: DeviceConfiguration): DeviceConfiguration {
  validatePositiveInteger(configuration.intervalMs, "intervalMs");
  validateSeed(configuration.seed);
  if (configuration.simulationSpeed !== undefined) {
    try {
      simulationSpeedMultiplier(configuration.simulationSpeed);
    } catch (error) {
      throw new DeviceConfigurationError(toError(error).message);
    }
  }
  try {
    parseDrivingStyleName(configuration.drivingStyle);
    getDeviceProfile(configuration.deviceProfile);
  } catch (error) {
    throw new DeviceConfigurationError(toError(error).message);
  }
  if (configuration.packetCount !== undefined) {
    validatePositiveInteger(configuration.packetCount, "packetCount");
  }
  return configuration;
}

function validateSnapshot(snapshot: DeviceSnapshot, routeId: string): DeviceSnapshot {
  if (!snapshot || typeof snapshot !== "object") {
    throw new DeviceConfigurationError("resumeFrom must be an object");
  }
  if (snapshot.checkpoint.routeId !== routeId) {
    throw new DeviceConfigurationError(
      `resumeFrom route ${snapshot.checkpoint.routeId} does not match route ${routeId}`,
    );
  }
  if (!Number.isSafeInteger(snapshot.acceptedRecordCount) || snapshot.acceptedRecordCount < 0) {
    throw new DeviceConfigurationError("resumeFrom.acceptedRecordCount must be a non-negative integer");
  }
  return cloneSnapshot(snapshot);
}

function cloneSnapshot(snapshot: DeviceSnapshot): DeviceSnapshot {
  return {
    checkpoint: { ...snapshot.checkpoint },
    acceptedRecordCount: snapshot.acceptedRecordCount,
  };
}

function validateImei(value: string): string {
  const imei = value.trim();
  if (!/^\d{15}$/.test(imei)) {
    throw new DeviceConfigurationError("imei must contain exactly 15 digits");
  }
  return imei;
}

function validateHost(value: string): string {
  const host = value.trim();
  if (host.length === 0) {
    throw new DeviceConfigurationError("host is required");
  }
  return host;
}

function validatePort(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 65_535) {
    throw new DeviceConfigurationError("port must be an integer between 1 and 65535");
  }
  return value;
}

function validatePositiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new DeviceConfigurationError(`${name} must be an integer greater than or equal to 1`);
  }
  return value;
}

function validateNonNegativeInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DeviceConfigurationError(`${name} must be a non-negative integer`);
  }
  return value;
}

function validateSeed(value: number): number {
  if (!Number.isSafeInteger(value)) {
    throw new DeviceConfigurationError("seed must be a safe integer");
  }
  return value;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
