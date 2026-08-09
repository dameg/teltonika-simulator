import { randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";

import {
  DashboardDomainError,
  normalizeImei,
  type DashboardConfigRevision,
  type DashboardDeviceRecord,
  type DashboardLogEvent,
  type DashboardPosition,
  type DashboardRunRecord,
} from "../domain";
import type {
  CreateDashboardDeviceInput,
  DashboardLogQuery,
  DashboardJourneyState,
  UpdateDashboardDeviceInput,
} from "../repositories";
import { DatabaseService } from "./database.module";

export const DASHBOARD_STORE = Symbol("DASHBOARD_STORE");

export interface DashboardStore {
  listDevices(): Promise<DashboardDeviceRecord[]>;
  getDevice(imei: string): Promise<DashboardDeviceRecord | undefined>;
  createDevice(input: CreateDashboardDeviceInput): Promise<DashboardDeviceRecord>;
  updateDevice(imei: string, patch: UpdateDashboardDeviceInput): Promise<DashboardDeviceRecord>;
  archiveDevice(imei: string): Promise<boolean>;
  listConfigRevisionsForPositions(positions: readonly DashboardPosition[]): Promise<DashboardConfigRevision[]>;
  getRun(imei: string): Promise<DashboardRunRecord | undefined>;
  listRuns(): Promise<DashboardRunRecord[]>;
  setRun(record: DashboardRunRecord): Promise<DashboardRunRecord>;
  startRun(record: DashboardRunRecord, event: DashboardLogEvent): Promise<DashboardRunRecord>;
  updateRun(imei: string, patch: Partial<Omit<DashboardRunRecord, "imei">>): Promise<DashboardRunRecord>;
  getActiveJourney<TCheckpoint = unknown>(imei: string): Promise<DashboardJourneyState<TCheckpoint> | undefined>;
  setJourney<TCheckpoint = unknown>(state: DashboardJourneyState<TCheckpoint>): Promise<DashboardJourneyState<TCheckpoint>>;
  updateLatestJourneyCheckpoint<TCheckpoint = unknown>(
    imei: string,
    checkpoint: TCheckpoint,
  ): Promise<void>;
  finishJourney(imei: string, completed: boolean): Promise<void>;
  appendLog(event: DashboardLogEvent): Promise<DashboardLogEvent>;
  listLogs(query?: DashboardLogQuery): Promise<DashboardLogEvent[]>;
  hideLogs(imei?: string): Promise<void>;
  listPositions(imei?: string, limit?: number): Promise<DashboardPosition[]>;
  archiveDashboardState(): Promise<void>;
  interruptActiveRuns(): Promise<number>;
}

interface DeviceRow {
  imei: string;
  label: string;
  config: Record<string, unknown>;
  config_revision: number;
  created_at: Date;
  updated_at: Date;
}

interface RunRow {
  imei: string;
  run_id: string;
  status: DashboardRunRecord["status"];
  updated_at: Date;
  started_at: Date | null;
  stopped_at: Date | null;
  last_error: string | null;
}

interface JourneyRow {
  imei: string;
  id: string;
  route_file: string | null;
  accepted_record_count: string;
  status: string;
  checkpoint: unknown;
}

interface LogRow {
  id: string;
  imei: string | null;
  severity: DashboardLogEvent["severity"];
  type: DashboardLogEvent["type"];
  message: string;
  timestamp: Date;
  context: DashboardLogEvent["context"] | null;
  data: unknown;
}

@Injectable()
export class PostgresDashboardStore implements DashboardStore {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async listDevices(): Promise<DashboardDeviceRecord[]> {
    const result = await this.database.query<DeviceRow>(deviceSelect(`${deviceBaseWhere} ORDER BY d.created_at, d.imei`));
    return result.rows.map(mapDevice);
  }

  async getDevice(imei: string): Promise<DashboardDeviceRecord | undefined> {
    const result = await this.database.query<DeviceRow>(
      deviceSelect(`${deviceBaseWhere} AND d.imei = $1`),
      [normalizeImei(imei)],
    );
    return result.rows[0] ? mapDevice(result.rows[0]) : undefined;
  }

  async createDevice(input: CreateDashboardDeviceInput): Promise<DashboardDeviceRecord> {
    const imei = normalizeImei(input.imei);
    try {
      await this.database.withTransaction(async (client) => {
        const now = new Date();
        const existing = await client.query<{
          archived_at: Date | null;
          config_revision: number | null;
        }>(
          `SELECT d.archived_at, sc.config_revision
           FROM devices d LEFT JOIN simulator_configs sc ON sc.imei = d.imei
           WHERE d.imei = $1 FOR UPDATE OF d`,
          [imei],
        );
        const current = existing.rows[0];
        if (current && current.archived_at === null && current.config_revision !== null) {
          throw new DashboardDomainError("DUPLICATE_IMEI", `IMEI already exists: ${imei}`);
        }
        const configRevision = current?.config_revision === null || current === undefined
          ? 1
          : current.config_revision + 1;

        if (current) {
          await client.query(
            `UPDATE devices SET label = $2, source = 'dashboard', archived_at = NULL, updated_at = $3
             WHERE imei = $1`,
            [imei, input.label, now],
          );
        } else {
          await client.query(
            `INSERT INTO devices (imei, label, source, created_at, updated_at)
             VALUES ($1, $2, 'dashboard', $3, $3)`,
            [imei, input.label, now],
          );
        }
        await client.query(
          `INSERT INTO simulator_configs (imei, config, config_revision)
           VALUES ($1, $2::jsonb, $3)
           ON CONFLICT (imei) DO UPDATE
             SET config = EXCLUDED.config, config_revision = EXCLUDED.config_revision`,
          [imei, JSON.stringify(input.config), configRevision],
        );
        await client.query(
          `INSERT INTO device_config_revisions
             (imei, config_revision, created_at, changed_fields, config)
           VALUES ($1, $2, $3, ARRAY[]::text[], $4::jsonb)`,
          [imei, configRevision, now, JSON.stringify(input.config)],
        );
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DashboardDomainError("DUPLICATE_IMEI", `IMEI already exists: ${imei}`);
      }
      throw error;
    }

    return (await this.getDevice(imei))!;
  }

  async updateDevice(imei: string, patch: UpdateDashboardDeviceInput): Promise<DashboardDeviceRecord> {
    const key = normalizeImei(imei);
    await this.database.withTransaction(async (client) => {
      if (patch.label !== undefined) {
        await client.query(
          "UPDATE devices SET label = $2, updated_at = now() WHERE imei = $1 AND archived_at IS NULL",
          [key, patch.label],
        );
      }
      if (patch.config !== undefined && patch.configRevision !== undefined) {
        await client.query(
          `UPDATE simulator_configs SET config = $2::jsonb, config_revision = $3
           WHERE imei = $1`,
          [key, JSON.stringify(patch.config), patch.configRevision],
        );
        await client.query(
          `INSERT INTO device_config_revisions
             (imei, config_revision, created_at, changed_fields, config)
           VALUES ($1, $2, now(), $3, $4::jsonb)`,
          [key, patch.configRevision, patch.changedConfigFields ?? [], JSON.stringify(patch.config)],
        );
      }
    });
    const updated = await this.getDevice(key);
    if (!updated) throw new DashboardDomainError("DEVICE_NOT_FOUND", `Device not found: ${key}`);
    return updated;
  }

  async archiveDevice(imei: string): Promise<boolean> {
    const result = await this.database.query(
      "UPDATE devices SET archived_at = now(), updated_at = now() WHERE imei = $1 AND archived_at IS NULL",
      [normalizeImei(imei)],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listConfigRevisionsForPositions(positions: readonly DashboardPosition[]): Promise<DashboardConfigRevision[]> {
    const references = [...new Set(positions.map((point) => `${point.imei}:${point.configRevision}`))];
    if (references.length === 0) return [];
    const result = await this.database.query<{
      imei: string; config_revision: number; created_at: Date; changed_fields: string[]; config: Record<string, unknown>;
    }>(
      `SELECT imei, config_revision, created_at, changed_fields, config
       FROM device_config_revisions
       WHERE (imei || ':' || config_revision::text) = ANY($1::text[])
       ORDER BY created_at, imei, config_revision`,
      [references],
    );
    return result.rows.map((row) => ({
      imei: row.imei,
      configRevision: row.config_revision,
      createdAtMs: row.created_at.getTime(),
      changedFields: row.changed_fields,
      config: row.config as DashboardConfigRevision["config"],
    }));
  }

  async getRun(imei: string): Promise<DashboardRunRecord | undefined> {
    const result = await this.database.query<RunRow>(`${latestRunsSql} WHERE imei = $1`, [normalizeImei(imei)]);
    return result.rows[0] ? mapRun(result.rows[0]) : undefined;
  }

  async listRuns(): Promise<DashboardRunRecord[]> {
    const result = await this.database.query<RunRow>(`${latestRunsSql} ORDER BY imei`);
    return result.rows.map(mapRun);
  }

  async setRun(record: DashboardRunRecord): Promise<DashboardRunRecord> {
    const runId = record.runId ?? randomUUID();
    await this.database.query(
      `INSERT INTO runs (run_id, imei, status, updated_at, started_at, stopped_at, last_error)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        runId,
        normalizeImei(record.imei),
        record.status,
        new Date(record.updatedAtMs),
        record.lastStartAtMs === undefined ? null : new Date(record.lastStartAtMs),
        record.lastStopAtMs === undefined ? null : new Date(record.lastStopAtMs),
        record.lastError ?? null,
      ],
    );
    return { ...record, runId };
  }

  async startRun(record: DashboardRunRecord, event: DashboardLogEvent): Promise<DashboardRunRecord> {
    const runId = record.runId ?? randomUUID();
    await this.database.withTransaction(async (client) => {
      await client.query(
        `INSERT INTO runs (run_id, imei, status, updated_at, started_at, stopped_at, last_error)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          runId,
          normalizeImei(record.imei),
          record.status,
          new Date(record.updatedAtMs),
          record.lastStartAtMs === undefined ? null : new Date(record.lastStartAtMs),
          record.lastStopAtMs === undefined ? null : new Date(record.lastStopAtMs),
          record.lastError ?? null,
        ],
      );
      await client.query(
        `INSERT INTO dashboard_logs
           (id, imei, severity, type, message, timestamp, context, data)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)`,
        [
          event.id,
          event.imei ?? null,
          event.severity,
          event.type,
          event.message,
          new Date(event.timestampMs),
          event.context === undefined ? null : JSON.stringify(event.context),
          event.data === undefined ? null : JSON.stringify(event.data),
        ],
      );
    });
    return { ...record, runId };
  }

  async updateRun(imei: string, patch: Partial<Omit<DashboardRunRecord, "imei">>): Promise<DashboardRunRecord> {
    const current = await this.getRun(imei);
    if (!current?.runId) {
      throw new DashboardDomainError("RUN_NOT_FOUND", `Run not found: ${normalizeImei(imei)}`);
    }
    const next = { ...current, ...patch, imei: current.imei };
    await this.database.query(
      `UPDATE runs SET status = $2, updated_at = $3, started_at = $4,
         stopped_at = $5, last_error = $6 WHERE run_id = $1`,
      [
        current.runId,
        next.status,
        new Date(next.updatedAtMs),
        next.lastStartAtMs === undefined ? null : new Date(next.lastStartAtMs),
        next.lastStopAtMs === undefined ? null : new Date(next.lastStopAtMs),
        next.lastError ?? null,
      ],
    );
    return next;
  }

  async getActiveJourney<TCheckpoint = unknown>(imei: string): Promise<DashboardJourneyState<TCheckpoint> | undefined> {
    const result = await this.database.query<JourneyRow>(
      `SELECT id, imei, route_file, accepted_record_count, status, checkpoint
       FROM trips WHERE imei = $1 AND status = 'active' ORDER BY started_at DESC LIMIT 1`,
      [normalizeImei(imei)],
    );
    return result.rows[0] ? mapJourney<TCheckpoint>(result.rows[0]) : undefined;
  }

  async setJourney<TCheckpoint = unknown>(state: DashboardJourneyState<TCheckpoint>): Promise<DashboardJourneyState<TCheckpoint>> {
    await this.database.query(
      `INSERT INTO trips
         (id, imei, status, route_file, accepted_record_count, checkpoint, started_at, finished_at)
       VALUES ($1::uuid, $2, $3, $4, $5, $6::jsonb, now(), $7)
       ON CONFLICT (id) DO UPDATE SET accepted_record_count = EXCLUDED.accepted_record_count,
         checkpoint = EXCLUDED.checkpoint, route_file = EXCLUDED.route_file,
         status = EXCLUDED.status, finished_at = EXCLUDED.finished_at`,
      [
        state.tripId,
        normalizeImei(state.imei),
        state.completed ? "completed" : "active",
        state.routeFile ?? null,
        state.acceptedRecordCount,
        state.checkpoint === undefined ? null : JSON.stringify(state.checkpoint),
        state.completed ? new Date() : null,
      ],
    );
    return structuredClone(state);
  }

  async updateLatestJourneyCheckpoint<TCheckpoint = unknown>(
    imei: string,
    checkpoint: TCheckpoint,
  ): Promise<void> {
    await this.database.query(
      `UPDATE trips
       SET checkpoint = $2::jsonb
       WHERE id = (
         SELECT id FROM trips WHERE imei = $1
         ORDER BY coalesce(finished_at, started_at) DESC, started_at DESC, id DESC
         LIMIT 1
       )`,
      [normalizeImei(imei), JSON.stringify(checkpoint)],
    );
  }

  async finishJourney(imei: string, completed: boolean): Promise<void> {
    await this.database.query(
      `UPDATE trips SET status = $2, finished_at = now()
       WHERE imei = $1 AND status = 'active'`,
      [normalizeImei(imei), completed ? "completed" : "interrupted"],
    );
  }

  async appendLog(event: DashboardLogEvent): Promise<DashboardLogEvent> {
    await this.database.query(
      `INSERT INTO dashboard_logs
         (id, imei, severity, type, message, timestamp, context, data)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)`,
      [
        event.id,
        event.imei ?? null,
        event.severity,
        event.type,
        event.message,
        new Date(event.timestampMs),
        event.context === undefined ? null : JSON.stringify(event.context),
        event.data === undefined ? null : JSON.stringify(event.data),
      ],
    );
    return structuredClone(event);
  }

  async listLogs(query: DashboardLogQuery = {}): Promise<DashboardLogEvent[]> {
    const values: unknown[] = [];
    const clauses = ["hidden_at IS NULL"];
    if (query.imei) {
      values.push(normalizeImei(query.imei));
      clauses.push(`imei = $${values.length}`);
    }
    if (query.severity) {
      values.push(query.severity);
      clauses.push(`severity = $${values.length}`);
    }
    if (query.type) {
      values.push(query.type);
      clauses.push(`type = $${values.length}`);
    }
    values.push(Math.min(query.limit ?? 100, 500));
    const result = await this.database.query<LogRow>(
      `SELECT id, imei, severity, type, message, timestamp, context, data
       FROM (SELECT * FROM dashboard_logs WHERE ${clauses.join(" AND ")}
             ORDER BY timestamp DESC, id DESC LIMIT $${values.length}) recent
       ORDER BY timestamp, id`,
      values,
    );
    return result.rows.map((row) => ({
      id: row.id,
      imei: row.imei ?? undefined,
      severity: row.severity,
      type: row.type,
      message: row.message,
      timestampMs: row.timestamp.getTime(),
      context: row.context ?? undefined,
      data: row.data ?? undefined,
    }));
  }

  async hideLogs(imei?: string): Promise<void> {
    await this.database.query(
      `UPDATE dashboard_logs SET hidden_at = now()
       WHERE hidden_at IS NULL AND ($1::text IS NULL OR imei = $1)`,
      [imei ? normalizeImei(imei) : null],
    );
  }

  async listPositions(imei?: string, limit = 5_000): Promise<DashboardPosition[]> {
    const values: unknown[] = [];
    const clauses = ["r.trip_id IS NOT NULL"];
    if (imei) {
      values.push(normalizeImei(imei));
      clauses.push(`f.imei = $${values.length}`);
    }
    values.push(Math.min(Math.max(limit, 1), 5_000));
    const result = await this.database.query<{
      imei: string; trip_id: string; config_revision: number | null; recorded_at: Date;
      latitude_e7: number; longitude_e7: number; altitude_m: number; heading_deg: number;
      speed_kph: number; satellites: number;
    }>(
      `SELECT imei, trip_id, config_revision, recorded_at, latitude_e7, longitude_e7,
              altitude_m, heading_deg, speed_kph, satellites
       FROM (
         SELECT f.imei, r.trip_id, NULL::integer AS config_revision,
                r.timestamp AS recorded_at, r.latitude_e7, r.longitude_e7,
                r.altitude_meters AS altitude_m, r.heading_degrees AS heading_deg,
                r.speed_kph, r.satellites, r.id
         FROM avl_records r JOIN avl_frames f ON f.id = r.frame_id
         WHERE ${clauses.join(" AND ")}
         ORDER BY r.id DESC LIMIT $${values.length}
       ) recent
       ORDER BY recorded_at, id`,
      values,
    );
    return result.rows.map((row) => ({
      imei: row.imei,
      tripId: row.trip_id,
      configRevision: row.config_revision ?? 1,
      timestampMs: row.recorded_at.getTime(),
      latitude: row.latitude_e7 / 10_000_000,
      longitude: row.longitude_e7 / 10_000_000,
      altitudeMeters: row.altitude_m,
      headingDegrees: row.heading_deg,
      speedKph: row.speed_kph,
      satellites: row.satellites,
    }));
  }

  async archiveDashboardState(): Promise<void> {
    await this.database.withTransaction(async (client) => {
      await client.query("UPDATE devices SET archived_at = now(), updated_at = now() WHERE archived_at IS NULL");
      await client.query("UPDATE trips SET status = 'interrupted', finished_at = now() WHERE status = 'active'");
      await client.query(
        "UPDATE runs SET status = 'interrupted', updated_at = now(), stopped_at = now() WHERE status IN ('starting','running','reconnecting')",
      );
      await client.query("UPDATE dashboard_logs SET hidden_at = now() WHERE hidden_at IS NULL");
    });
  }

  async interruptActiveRuns(): Promise<number> {
    const result = await this.database.query(
      "UPDATE runs SET status = 'interrupted', updated_at = now(), stopped_at = now() WHERE status IN ('starting','running','reconnecting')",
    );
    return result.rowCount ?? 0;
  }
}

const deviceBaseWhere = "WHERE d.archived_at IS NULL";

function deviceSelect(suffix: string): string {
  return `SELECT d.imei, d.label, sc.config, sc.config_revision, d.created_at, d.updated_at
          FROM devices d JOIN simulator_configs sc ON sc.imei = d.imei ${suffix}`;
}

const latestRunsSql = `SELECT imei, run_id, status, updated_at, started_at, stopped_at, last_error
  FROM (SELECT DISTINCT ON (imei) * FROM runs ORDER BY imei, updated_at DESC, run_id DESC) latest`;

function mapDevice(row: DeviceRow): DashboardDeviceRecord {
  return {
    imei: row.imei,
    label: row.label,
    config: row.config as DashboardDeviceRecord["config"],
    configRevision: row.config_revision,
    createdAtMs: row.created_at.getTime(),
    updatedAtMs: row.updated_at.getTime(),
  };
}

function mapRun(row: RunRow): DashboardRunRecord {
  return {
    imei: row.imei,
    runId: row.run_id,
    status: row.status,
    updatedAtMs: row.updated_at.getTime(),
    lastStartAtMs: row.started_at?.getTime(),
    lastStopAtMs: row.stopped_at?.getTime(),
    lastError: row.last_error ?? undefined,
  };
}

function mapJourney<TCheckpoint>(row: JourneyRow): DashboardJourneyState<TCheckpoint> {
  return {
    imei: row.imei,
    tripId: row.id,
    routeFile: row.route_file ?? undefined,
    acceptedRecordCount: Number(row.accepted_record_count),
    completed: row.status === "completed",
    checkpoint: row.checkpoint as TCheckpoint | undefined,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
