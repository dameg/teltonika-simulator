import { Inject, Injectable } from "@nestjs/common";
import type { QueryResultRow } from "pg";

import type { DashboardTelemetrySnapshot } from "../domain";
import { DatabaseService } from "../persistence/database.service";
import { encodeHistoryCursor, type ParsedHistoryQuery } from "./history-query";
import {
  mapStoredTelemetry,
  type StoredAvlIoElement,
  type StoredAvlRecord,
} from "./telemetry-mapper";

export interface HistoryPage<TItem> {
  items: TItem[];
  nextCursor?: string;
}

export interface HistoryDevice {
  archived: boolean;
  imei: string;
  label: string;
  source: string;
}

export interface HistoryIoElement {
  byteaHex?: string;
  ioId: number;
  ioSizeBytes: number;
  numericValue?: string;
}

export interface HistoryFrame {
  codecId: number | null;
  crc: number | null;
  dataLength: number | null;
  decodeError: unknown;
  decodeStatus: "pending" | "decoded" | "failed";
  firstSeenAtMs: number;
  id: string;
  latestReceivedAtMs?: number;
  payloadBytes: number;
  payloadHex?: string;
  receptionCount: number;
  receptions?: HistoryFrameReception[];
  recordCount: number | null;
}

export interface HistoryFrameReception {
  acknowledgedRecordCount: number | null;
  id: string;
  receivedAtMs: number;
  runId: string | null;
  sessionId: string;
  tripId: string | null;
}

export interface HistoryRecord {
  altitudeMeters: number;
  eventIoId: number;
  frameId: string;
  headingDegrees: number;
  id: string;
  io: HistoryIoElement[];
  latitude: number;
  longitude: number;
  priority: 0 | 1 | 2;
  satellites: number;
  speedKph: number;
  telemetry: DashboardTelemetrySnapshot;
  timestampMs: number;
  tripId: string | null;
}

export interface HistoryTrip {
  acceptedRecordCount: number;
  finishedAtMs?: number;
  id: string;
  recordCount: number;
  startedAtMs: number;
  status: string;
}

interface HistoryRecordRow extends QueryResultRow, StoredAvlRecord {
  frameId: string;
  id: string;
  tripId: string | null;
}

interface HistoryIoRow extends QueryResultRow, StoredAvlIoElement {
  recordId: string;
}

interface HistoryTripRow extends QueryResultRow {
  acceptedRecordCount: number;
  finishedAt: Date | null;
  id: string;
  recordCount: string;
  startedAt: Date;
  status: string;
}

interface HistoryFrameRow extends QueryResultRow {
  codecId: number | null;
  crc: number | null;
  dataLength: number | null;
  decodeError: unknown;
  decodeStatus: HistoryFrame["decodeStatus"];
  firstSeenAt: Date;
  id: string;
  latestReceivedAt: Date | null;
  payload: Buffer | null;
  payloadBytes: number;
  receptionCount: string;
  recordCount: number | null;
}

interface HistoryDeviceRow extends QueryResultRow {
  archived: boolean;
  imei: string;
  label: string;
  source: string;
}

interface HistoryFrameReceptionRow extends QueryResultRow {
  acknowledgedRecordCount: number | null;
  id: string;
  receivedAt: Date;
  runId: string | null;
  sessionId: string;
  tripId: string | null;
}

@Injectable()
export class HistoryRepository {
  constructor(
    @Inject(DatabaseService)
    private readonly database: DatabaseService,
  ) {}

  async listDevices(): Promise<HistoryDevice[]> {
    const result = await this.database.query<HistoryDeviceRow>(
      `SELECT imei, label, source, archived_at IS NOT NULL AS archived
       FROM devices
       ORDER BY archived_at NULLS FIRST, label, imei`,
    );
    return result.rows;
  }

  async listDeviceFrames(
    imei: string,
    query: ParsedHistoryQuery,
  ): Promise<HistoryPage<HistoryFrame>> {
    const values: unknown[] = [imei];
    const predicates = ["f.imei = $1"];
    if (query.from) predicates.push(`f.first_seen_at >= $${push(values, query.from)}`);
    if (query.to) predicates.push(`f.first_seen_at <= $${push(values, query.to)}`);
    if (query.cursor) {
      values.push(new Date(query.cursor.timestampMs), query.cursor.id);
      predicates.push(`(f.first_seen_at, f.id) < ($${values.length - 1}, $${values.length}::bigint)`);
    }
    values.push(query.limit + 1);

    const result = await this.database.query<HistoryFrameRow>(
      `SELECT f.id::text AS id,
              f.decode_status AS "decodeStatus",
              f.decode_error AS "decodeError",
              f.codec_id AS "codecId",
              f.data_length AS "dataLength",
              f.record_count AS "recordCount",
              f.crc,
              f.first_seen_at AS "firstSeenAt",
              octet_length(f.payload) AS "payloadBytes",
              count(rx.id)::text AS "receptionCount",
              max(rx.received_at) AS "latestReceivedAt",
              NULL::bytea AS payload
         FROM avl_frames f
         LEFT JOIN avl_frame_receptions rx ON rx.frame_id = f.id
        WHERE ${predicates.join(" AND ")}
        GROUP BY f.id
        ORDER BY f.first_seen_at DESC, f.id DESC
        LIMIT $${values.length}`,
      values,
    );

    const pageRows = result.rows.slice(0, query.limit);
    return {
      items: pageRows.map(mapFrame),
      ...(result.rows.length > query.limit && pageRows.length > 0
        ? { nextCursor: frameCursor(pageRows[pageRows.length - 1]!) }
        : {}),
    };
  }

  async getFrame(frameId: string): Promise<HistoryFrame | undefined> {
    const result = await this.database.query<HistoryFrameRow>(
      `SELECT f.id::text AS id,
              f.decode_status AS "decodeStatus",
              f.decode_error AS "decodeError",
              f.codec_id AS "codecId",
              f.data_length AS "dataLength",
              f.record_count AS "recordCount",
              f.crc,
              f.first_seen_at AS "firstSeenAt",
              octet_length(f.payload) AS "payloadBytes",
              f.payload,
              count(rx.id)::text AS "receptionCount",
              max(rx.received_at) AS "latestReceivedAt"
         FROM avl_frames f
         LEFT JOIN avl_frame_receptions rx ON rx.frame_id = f.id
        WHERE f.id = $1::bigint
        GROUP BY f.id`,
      [frameId],
    );
    if (!result.rows[0]) return undefined;
    const receptions = await this.database.query<HistoryFrameReceptionRow>(
      `SELECT id::text AS id, session_id AS "sessionId", run_id::text AS "runId",
              trip_id::text AS "tripId", received_at AS "receivedAt",
              acknowledged_record_count AS "acknowledgedRecordCount"
       FROM avl_frame_receptions
       WHERE frame_id = $1::bigint
       ORDER BY received_at, id`,
      [frameId],
    );
    return {
      ...mapFrame(result.rows[0]),
      receptions: receptions.rows.map((row) => ({
        id: row.id,
        sessionId: row.sessionId,
        runId: row.runId,
        tripId: row.tripId,
        receivedAtMs: row.receivedAt.getTime(),
        acknowledgedRecordCount: row.acknowledgedRecordCount,
      })),
    };
  }

  async listDeviceRecords(
    imei: string,
    query: ParsedHistoryQuery,
  ): Promise<HistoryPage<HistoryRecord>> {
    return this.listRecords(
      "f.imei = $1",
      [imei],
      query,
      "DESC",
    );
  }

  async listTripRecords(
    tripId: string,
    query: ParsedHistoryQuery,
  ): Promise<HistoryPage<HistoryRecord>> {
    return this.listRecords(
      "r.trip_id = $1::uuid",
      [tripId],
      query,
      "ASC",
    );
  }

  async listTripRoute(tripId: string, maximumPoints: number): Promise<HistoryRecord[]> {
    const result = await this.database.query<HistoryRecordRow>(
      `WITH ordered AS (
         SELECT r.id::text AS id, r.id AS sort_id,
                r.frame_id::text AS "frameId", r.trip_id::text AS "tripId",
                r.timestamp, r.priority, r.longitude_e7 AS "longitudeE7",
                r.latitude_e7 AS "latitudeE7", r.altitude_meters AS "altitudeMeters",
                r.heading_degrees AS "headingDegrees", r.satellites,
                r.speed_kph AS "speedKph", r.event_io_id AS "eventIoId",
                row_number() OVER (ORDER BY r.timestamp, r.id) AS sample_row,
                count(*) OVER () AS total_rows
         FROM avl_records r WHERE r.trip_id = $1::uuid
       ), sample_rows AS (
         SELECT DISTINCT 1 + floor(
           sample_index * (total_rows - 1)::numeric / greatest(sample_count - 1, 1)
         )::bigint AS sample_row
         FROM (SELECT max(total_rows)::integer AS total_rows,
                      least(max(total_rows)::integer, $2::integer) AS sample_count
               FROM ordered) totals
         CROSS JOIN LATERAL generate_series(0, greatest(sample_count - 1, 0)) AS sample_index
       )
       SELECT o.id, o."frameId", o."tripId", o.timestamp, o.priority,
              o."longitudeE7", o."latitudeE7", o."altitudeMeters", o."headingDegrees",
              o.satellites, o."speedKph", o."eventIoId"
       FROM ordered o JOIN sample_rows s USING (sample_row)
       ORDER BY o.timestamp, o.sort_id`,
      [tripId, maximumPoints],
    );
    const ioByRecord = await this.loadIo(result.rows.map((row) => row.id));
    return result.rows.map((row) => mapRecord(row, ioByRecord.get(row.id) ?? []));
  }

  async getRecord(recordId: string): Promise<HistoryRecord | undefined> {
    const page = await this.listRecords("r.id = $1::bigint", [recordId], { limit: 1 }, "ASC");
    return page.items[0];
  }

  async listLiveRecords(afterRecordId: string, limit: number): Promise<HistoryRecord[]> {
    const result = await this.database.query<HistoryRecordRow>(
      `SELECT r.id::text AS id, r.frame_id::text AS "frameId", r.trip_id::text AS "tripId",
              r.timestamp, r.priority, r.longitude_e7 AS "longitudeE7",
              r.latitude_e7 AS "latitudeE7", r.altitude_meters AS "altitudeMeters",
              r.heading_degrees AS "headingDegrees", r.satellites,
              r.speed_kph AS "speedKph", r.event_io_id AS "eventIoId"
       FROM avl_records r JOIN trips t ON t.id = r.trip_id
       WHERE t.status = 'active' AND r.id > $1::bigint
       ORDER BY r.id ASC LIMIT $2`,
      [afterRecordId, limit],
    );
    const ioByRecord = await this.loadIo(result.rows.map((row) => row.id));
    return result.rows.map((row) => mapRecord(row, ioByRecord.get(row.id) ?? []));
  }

  async listDeviceTrips(
    imei: string,
    query: ParsedHistoryQuery,
  ): Promise<HistoryPage<HistoryTrip>> {
    const values: unknown[] = [imei];
    const predicates = ["t.imei = $1"];
    if (query.from) predicates.push(`t.started_at >= $${push(values, query.from)}`);
    if (query.to) predicates.push(`t.started_at <= $${push(values, query.to)}`);
    if (query.cursor) {
      values.push(new Date(query.cursor.timestampMs), query.cursor.id);
      predicates.push(`(t.started_at, t.id) < ($${values.length - 1}, $${values.length}::uuid)`);
    }
    values.push(query.limit + 1);

    const result = await this.database.query<HistoryTripRow>(
      `SELECT t.id::text AS id,
              t.status,
              t.accepted_record_count AS "acceptedRecordCount",
              t.started_at AS "startedAt",
              t.finished_at AS "finishedAt",
              count(r.id)::text AS "recordCount"
         FROM trips t
         LEFT JOIN avl_records r ON r.trip_id = t.id
        WHERE ${predicates.join(" AND ")}
        GROUP BY t.id
        ORDER BY t.started_at DESC, t.id DESC
        LIMIT $${values.length}`,
      values,
    );

    const pageRows = result.rows.slice(0, query.limit);
    const items = pageRows.map(mapTrip);
    return {
      items,
      ...(result.rows.length > query.limit && pageRows.length > 0
        ? { nextCursor: tripCursor(pageRows[pageRows.length - 1]!) }
        : {}),
    };
  }

  private async listRecords(
    scopePredicate: string,
    initialValues: unknown[],
    query: ParsedHistoryQuery,
    direction: "ASC" | "DESC",
  ): Promise<HistoryPage<HistoryRecord>> {
    const values = [...initialValues];
    const predicates = [scopePredicate];
    if (query.from) predicates.push(`r.timestamp >= $${push(values, query.from)}`);
    if (query.to) predicates.push(`r.timestamp <= $${push(values, query.to)}`);
    if (query.cursor) {
      values.push(new Date(query.cursor.timestampMs), query.cursor.id);
      const operator = direction === "ASC" ? ">" : "<";
      predicates.push(
        `(r.timestamp, r.id) ${operator} ($${values.length - 1}, $${values.length}::bigint)`,
      );
    }
    values.push(query.limit + 1);

    const result = await this.database.query<HistoryRecordRow>(
      `SELECT r.id::text AS id,
              r.frame_id::text AS "frameId",
              r.trip_id::text AS "tripId",
              r.timestamp,
              r.priority,
              r.longitude_e7 AS "longitudeE7",
              r.latitude_e7 AS "latitudeE7",
              r.altitude_meters AS "altitudeMeters",
              r.heading_degrees AS "headingDegrees",
              r.satellites,
              r.speed_kph AS "speedKph",
              r.event_io_id AS "eventIoId"
         FROM avl_records r
         JOIN avl_frames f ON f.id = r.frame_id
        WHERE ${predicates.join(" AND ")}
        ORDER BY r.timestamp ${direction}, r.id ${direction}
        LIMIT $${values.length}`,
      values,
    );

    const pageRows = result.rows.slice(0, query.limit);
    const ioByRecord = await this.loadIo(pageRows.map((row) => row.id));
    const items = pageRows.map((row) => mapRecord(row, ioByRecord.get(row.id) ?? []));
    const lastRow = pageRows[pageRows.length - 1];
    return {
      items,
      ...(result.rows.length > query.limit && lastRow
        ? { nextCursor: recordCursor(lastRow) }
        : {}),
    };
  }

  private async loadIo(recordIds: readonly string[]): Promise<Map<string, HistoryIoRow[]>> {
    const grouped = new Map<string, HistoryIoRow[]>();
    if (recordIds.length === 0) return grouped;

    const result = await this.database.query<HistoryIoRow>(
      `SELECT record_id::text AS "recordId",
              io_id AS "ioId",
              io_size_bytes AS "ioSizeBytes",
              numeric_value::text AS "numericValue",
              bytea_value AS "byteaValue"
         FROM avl_io_elements
        WHERE record_id = ANY($1::bigint[])
        ORDER BY record_id, element_index`,
      [recordIds],
    );
    for (const row of result.rows) {
      const rows = grouped.get(row.recordId) ?? [];
      rows.push(row);
      grouped.set(row.recordId, rows);
    }
    return grouped;
  }
}

function mapRecord(row: HistoryRecordRow, elements: readonly HistoryIoRow[]): HistoryRecord {
  const mapped = mapStoredTelemetry(row, elements);
  return {
    id: row.id,
    frameId: row.frameId,
    tripId: row.tripId,
    timestampMs: mapped.record.timestampMs,
    priority: row.priority,
    longitude: row.longitudeE7 / 10_000_000,
    latitude: row.latitudeE7 / 10_000_000,
    altitudeMeters: row.altitudeMeters,
    headingDegrees: row.headingDegrees,
    satellites: row.satellites,
    speedKph: row.speedKph,
    eventIoId: row.eventIoId,
    io: elements.map((element) => ({
      ioId: element.ioId,
      ioSizeBytes: element.ioSizeBytes,
      ...(element.numericValue === null ? {} : { numericValue: element.numericValue }),
      ...(element.byteaValue === null
        ? {}
        : { byteaHex: element.byteaValue.toString("hex") }),
    })),
    telemetry: mapped.telemetry,
  };
}

function mapTrip(row: HistoryTripRow): HistoryTrip {
  return {
    id: row.id,
    status: row.status,
    acceptedRecordCount: Number(row.acceptedRecordCount),
    recordCount: Number(row.recordCount),
    startedAtMs: row.startedAt.getTime(),
    ...(row.finishedAt ? { finishedAtMs: row.finishedAt.getTime() } : {}),
  };
}

function mapFrame(row: HistoryFrameRow): HistoryFrame {
  return {
    id: row.id,
    decodeStatus: row.decodeStatus,
    decodeError: row.decodeError,
    codecId: row.codecId,
    dataLength: row.dataLength,
    recordCount: row.recordCount,
    crc: row.crc,
    firstSeenAtMs: row.firstSeenAt.getTime(),
    payloadBytes: row.payloadBytes,
    receptionCount: Number(row.receptionCount),
    ...(row.latestReceivedAt
      ? { latestReceivedAtMs: row.latestReceivedAt.getTime() }
      : {}),
    ...(row.payload ? { payloadHex: row.payload.toString("hex") } : {}),
  };
}

function recordCursor(row: HistoryRecordRow): string {
  return encodeHistoryCursor({
    kind: "record",
    timestampMs: asDate(row.timestamp).getTime(),
    id: row.id,
  });
}

function frameCursor(row: HistoryFrameRow): string {
  return encodeHistoryCursor({ kind: "frame", timestampMs: row.firstSeenAt.getTime(), id: row.id });
}

function tripCursor(row: HistoryTripRow): string {
  return encodeHistoryCursor({ kind: "trip", timestampMs: row.startedAt.getTime(), id: row.id });
}

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function push(values: unknown[], value: unknown): number {
  values.push(value);
  return values.length;
}
