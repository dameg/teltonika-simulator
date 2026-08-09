import { createHash, randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import type { PoolClient, QueryResultRow } from "pg";

import type {
  DecodedCodec8ExtendedPacket,
} from "../../codec8-extended-decoder";
import type { AvlIoElement, AvlRecord } from "../../domain";
import type {
  FrameDecodeFailureInput,
  FrameIngestInput,
  FrameIngestStore,
} from "../../frame-ingest-store";
import { normalizeImei } from "../domain";
import { DatabaseService } from "./database.service";
import { determineTripTransition } from "./trip-policy";

const ignitionIoId = 239;

interface FrameRow extends QueryResultRow {
  id: string;
}

interface RecordRow extends QueryResultRow {
  tripId: string | null;
}

interface ActiveTripRow extends QueryResultRow {
  id: string;
  lastTimestamp: Date | null;
  startedAt: Date;
}

interface TripState {
  hasRecords: boolean;
  id: string;
  lastTimestampMs: number;
}

@Injectable()
export class PostgresFrameStore implements FrameIngestStore {
  constructor(
    @Inject(DatabaseService)
    private readonly database: DatabaseService,
  ) {}

  async persistFrame(input: FrameIngestInput): Promise<{ receptionId: string }> {
    const imei = normalizeImei(input.imei);
    assertReceivedAt(input.receivedAt);
    assertSessionId(input.sessionId);

    const receptionId = await this.database.withTransaction(async (client) => {
      await ensurePhysicalDevice(client, imei);
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [imei]);
      const frame = await insertDecodedFrame(
        client,
        imei,
        input.rawFrame,
        input.decoded,
        input.receivedAt,
      );
      let tripId: string | null;

      if (frame.inserted) {
        tripId = await this.insertRecords(client, frame.id, imei, input.decoded.records);
      } else {
        tripId = await firstFrameTripId(client, frame.id);
      }

      const receptionId = await insertReception(client, {
        frameId: frame.id,
        imei,
        receivedAt: input.receivedAt,
        sessionId: input.sessionId,
        tripId,
      });
      await insertFrameLog(client, {
        frameId: frame.id,
        imei,
        message: `${frame.inserted ? "Received" : "Received retransmission of"} Codec 8E frame for ${imei}.`,
        receivedAt: input.receivedAt,
        severity: "info",
        type: "avlFrameReceived",
        data: { canonical: frame.inserted, receptionId, recordCount: input.decoded.recordCount },
      });
      return receptionId;
    });
    return { receptionId };
  }

  async markAcknowledged(receptionId: string, recordCount: number): Promise<void> {
    await this.database.query(
      `UPDATE avl_frame_receptions SET acknowledged_record_count = $2
       WHERE id = $1::bigint`,
      [receptionId, recordCount],
    );
  }

  async auditDecodeFailure(input: FrameDecodeFailureInput): Promise<void> {
    const imei = normalizeImei(input.imei);
    assertReceivedAt(input.receivedAt);
    assertSessionId(input.sessionId);

    await this.database.withTransaction(async (client) => {
      await ensurePhysicalDevice(client, imei);
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [imei]);
      const frame = await insertFailedFrame(
        client,
        imei,
        input.rawFrame,
        input.error,
        input.receivedAt,
      );
      const receptionId = await insertReception(client, {
        frameId: frame.id,
        imei,
        receivedAt: input.receivedAt,
        sessionId: input.sessionId,
        tripId: null,
      });
      await insertFrameLog(client, {
        frameId: frame.id,
        imei,
        message: `Rejected undecodable Codec 8E frame for ${imei}: ${input.error.message}`,
        receivedAt: input.receivedAt,
        severity: "warn",
        type: "avlFrameDecodeFailed",
        data: { decodeError: input.error, receptionId },
      });
    });
  }

  private async insertRecords(
    client: PoolClient,
    frameId: string,
    imei: string,
    records: readonly AvlRecord[],
  ): Promise<string | null> {
    let activeTrip = await lockActiveTrip(client, imei);
    let firstTripId: string | null = null;

    for (const [recordIndex, record] of records.entries()) {
      assertRecordTimestamp(record.timestampMs);
      const assignment = await assignTrip(client, imei, record, activeTrip);
      activeTrip = assignment.activeTrip;
      firstTripId ??= assignment.tripId;

      const inserted = await client.query<FrameRow>(
        `INSERT INTO avl_records (
           frame_id, imei, record_index, trip_id, timestamp, priority,
           longitude_e7, latitude_e7, altitude_meters, heading_degrees,
           satellites, speed_kph, event_io_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING id::text AS id`,
        [
          frameId,
          imei,
          recordIndex,
          assignment.tripId,
          new Date(record.timestampMs),
          record.priority,
          record.gps.longitude,
          record.gps.latitude,
          record.gps.altitudeMeters,
          record.gps.headingDegrees,
          record.gps.satellites,
          record.gps.speedKph,
          record.eventIoId,
        ],
      );
      const recordId = requiredRow(inserted.rows, "inserted AVL record").id;
      await insertIoElements(client, recordId, record);

      if (assignment.tripId) {
        await client.query(
          `UPDATE trips
              SET accepted_record_count = accepted_record_count + 1
            WHERE id = $1`,
          [assignment.tripId],
        );
      }
    }

    return firstTripId;
  }
}

async function ensurePhysicalDevice(client: PoolClient, imei: string): Promise<void> {
  await client.query(
    `INSERT INTO devices (imei, label, source)
     VALUES ($1, $2, 'physical')
     ON CONFLICT (imei) DO UPDATE SET updated_at = now()`,
    [imei, imei],
  );
}

async function insertDecodedFrame(
  client: PoolClient,
  imei: string,
  rawFrame: Buffer,
  decoded: DecodedCodec8ExtendedPacket,
  receivedAt: Date,
): Promise<{ id: string; inserted: boolean }> {
  const inserted = await client.query<FrameRow>(
    `INSERT INTO avl_frames (
       imei, codec_id, payload, data_length, record_count, crc, decode_status, first_seen_at
     ) VALUES ($1, $2, $3, $4, $5, $6, 'decoded', $7)
     ON CONFLICT (imei, payload_sha256) DO NOTHING
     RETURNING id::text AS id`,
    [imei, decoded.codecId, rawFrame, decoded.dataLength, decoded.recordCount, decoded.crc, receivedAt],
  );
  if (inserted.rows[0]) {
    return { id: inserted.rows[0].id, inserted: true };
  }

  return { id: await frameIdByPayload(client, imei, rawFrame), inserted: false };
}

async function insertFailedFrame(
  client: PoolClient,
  imei: string,
  rawFrame: Buffer,
  error: FrameDecodeFailureInput["error"],
  receivedAt: Date,
): Promise<{ id: string }> {
  const inserted = await client.query<FrameRow>(
    `INSERT INTO avl_frames (
       imei, payload, decode_status, decode_error, first_seen_at
     ) VALUES ($1, $2, 'failed', $3::jsonb, $4)
     ON CONFLICT (imei, payload_sha256) DO NOTHING
     RETURNING id::text AS id`,
    [imei, rawFrame, JSON.stringify(error), receivedAt],
  );

  return { id: inserted.rows[0]?.id ?? await frameIdByPayload(client, imei, rawFrame) };
}

async function frameIdByPayload(
  client: PoolClient,
  imei: string,
  rawFrame: Buffer,
): Promise<string> {
  const hash = createHash("sha256").update(rawFrame).digest();
  const result = await client.query<FrameRow>(
    `SELECT id::text AS id
       FROM avl_frames
      WHERE imei = $1 AND payload_sha256 = $2`,
    [imei, hash],
  );
  return requiredRow(result.rows, "canonical AVL frame").id;
}

async function firstFrameTripId(client: PoolClient, frameId: string): Promise<string | null> {
  const result = await client.query<RecordRow>(
    `SELECT trip_id::text AS "tripId"
       FROM avl_records
      WHERE frame_id = $1
      ORDER BY record_index
      LIMIT 1`,
    [frameId],
  );
  return result.rows[0]?.tripId ?? null;
}

async function insertReception(
  client: PoolClient,
  input: { frameId: string; imei: string; receivedAt: Date; sessionId: string; tripId: string | null },
): Promise<string> {
  const result = await client.query<FrameRow>(
    `INSERT INTO avl_frame_receptions (
       frame_id, imei, session_id, trip_id, received_at, acknowledged_record_count
     ) VALUES ($1, $2, $3, $4, $5, NULL)
     RETURNING id::text AS id`,
    [input.frameId, input.imei, input.sessionId, input.tripId, input.receivedAt],
  );
  return requiredRow(result.rows, "AVL frame reception").id;
}

async function insertFrameLog(
  client: PoolClient,
  input: {
    data: unknown;
    frameId: string;
    imei: string;
    message: string;
    receivedAt: Date;
    severity: "info" | "warn";
    type: "avlFrameReceived" | "avlFrameDecodeFailed";
  },
): Promise<void> {
  await client.query(
    `INSERT INTO dashboard_logs
       (id, imei, severity, type, message, timestamp, data, frame_id)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::jsonb, $8::bigint)`,
    [
      randomUUID(),
      input.imei,
      input.severity,
      input.type,
      input.message,
      input.receivedAt,
      JSON.stringify(input.data),
      input.frameId,
    ],
  );
}

async function lockActiveTrip(client: PoolClient, imei: string): Promise<TripState | null> {
  const result = await client.query<ActiveTripRow>(
    `SELECT t.id::text AS id,
            (SELECT max(r.timestamp) FROM avl_records r WHERE r.trip_id = t.id) AS "lastTimestamp",
            t.started_at AS "startedAt"
       FROM trips t
      WHERE t.imei = $1 AND t.status = 'active'
      ORDER BY t.started_at DESC
      LIMIT 1
      FOR UPDATE OF t`,
    [imei],
  );
  const row = result.rows[0];
  if (!row) return null;

  return {
    hasRecords: row.lastTimestamp !== null,
    id: row.id,
    lastTimestampMs: (row.lastTimestamp ?? row.startedAt).getTime(),
  };
}

async function assignTrip(
  client: PoolClient,
  imei: string,
  record: AvlRecord,
  current: TripState | null,
): Promise<{ activeTrip: TripState | null; tripId: string | null }> {
  const ignition = ignitionState(record);
  let activeTrip = current;
  if (activeTrip && !activeTrip.hasRecords) {
    if (ignition === false) {
      await closeEmptyTrip(client, activeTrip.id, record.timestampMs);
      return { activeTrip: null, tripId: null };
    }
    await client.query("UPDATE trips SET started_at = $2 WHERE id = $1 AND status = 'active'", [
      activeTrip.id,
      new Date(record.timestampMs),
    ]);
    return {
      activeTrip: { ...activeTrip, hasRecords: true, lastTimestampMs: record.timestampMs },
      tripId: activeTrip.id,
    };
  }
  const transition = determineTripTransition({
    currentLastTimestampMs: activeTrip?.lastTimestampMs ?? null,
    ignition,
    recordTimestampMs: record.timestampMs,
  });

  if ((transition === "close" || transition === "rollover") && activeTrip) {
    await closeTrip(client, activeTrip.id, activeTrip.lastTimestampMs);
    activeTrip = null;
  }

  if (transition === "start" || transition === "rollover") {
    activeTrip = await createTrip(client, imei, record.timestampMs);
  }

  if (transition === "close" || transition === "none" || !activeTrip) {
    return { activeTrip: null, tripId: null };
  }

  const tripId = activeTrip.id;
  activeTrip = {
    ...activeTrip,
    hasRecords: true,
    lastTimestampMs: Math.max(activeTrip.lastTimestampMs, record.timestampMs),
  };

  if (transition === "continue-and-close") {
    await closeTrip(client, tripId, activeTrip.lastTimestampMs);
    activeTrip = null;
  }

  return { activeTrip, tripId };
}

async function createTrip(client: PoolClient, imei: string, timestampMs: number): Promise<TripState> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO trips (
       id, imei, status, route_file, accepted_record_count, checkpoint, started_at, finished_at
     ) VALUES ($1, $2, 'active', NULL, 0, NULL, $3, NULL)`,
    [id, imei, new Date(timestampMs)],
  );
  return { hasRecords: false, id, lastTimestampMs: timestampMs };
}

async function closeEmptyTrip(client: PoolClient, id: string, timestampMs: number): Promise<void> {
  await client.query(
    `UPDATE trips SET status = 'completed', started_at = $2, finished_at = $2
     WHERE id = $1 AND status = 'active'`,
    [id, new Date(timestampMs)],
  );
}

async function closeTrip(client: PoolClient, id: string, timestampMs: number): Promise<void> {
  await client.query(
    `UPDATE trips
        SET status = 'completed', finished_at = $2
      WHERE id = $1 AND status = 'active'`,
    [id, new Date(timestampMs)],
  );
}

function ignitionState(record: AvlRecord): boolean | undefined {
  for (const element of numericElements(record)) {
    if (element.id === ignitionIoId) {
      return Number(element.value) !== 0;
    }
  }
  return undefined;
}

function numericElements(record: AvlRecord): ReadonlyArray<AvlIoElement<number | bigint>> {
  return [
    ...record.io.oneByte,
    ...record.io.twoBytes,
    ...record.io.fourBytes,
    ...record.io.eightBytes,
  ];
}

async function insertIoElements(
  client: PoolClient,
  recordId: string,
  record: AvlRecord,
): Promise<void> {
  const elements = [
    ...numericGroup(record.io.oneByte, 1),
    ...numericGroup(record.io.twoBytes, 2),
    ...numericGroup(record.io.fourBytes, 4),
    ...numericGroup(record.io.eightBytes, 8),
    ...record.io.xBytes.map((element) => ({
      ioId: element.id,
      ioSizeBytes: element.value.byteLength,
      numericValue: null,
      byteaValue: Buffer.from(element.value),
    })),
  ];
  if (elements.length === 0) return;

  const maximumElementsPerInsert = 5_000;
  for (let start = 0; start < elements.length; start += maximumElementsPerInsert) {
    const chunk = elements.slice(start, start + maximumElementsPerInsert);
    const parameters: unknown[] = [];
    const values = chunk.map((element, chunkIndex) => {
      const offset = parameters.length;
      parameters.push(
        recordId,
        start + chunkIndex,
        element.ioId,
        element.ioSizeBytes,
        element.numericValue,
        element.byteaValue,
      );
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`;
    });

    await client.query(
      `INSERT INTO avl_io_elements (
         record_id, element_index, io_id, io_size_bytes, numeric_value, bytea_value
       ) VALUES ${values.join(", ")}`,
      parameters,
    );
  }
}

function numericGroup(
  elements: readonly AvlIoElement<number | bigint>[],
  ioSizeBytes: 1 | 2 | 4 | 8,
) {
  return elements.map((element) => ({
    ioId: element.id,
    ioSizeBytes,
    numericValue: String(element.value),
    byteaValue: null,
  }));
}

function requiredRow<TRow>(rows: readonly TRow[], description: string): TRow {
  const row = rows[0];
  if (!row) throw new Error(`Database did not return ${description}.`);
  return row;
}

function assertReceivedAt(value: Date): void {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new TypeError("receivedAt must be a valid Date.");
  }
}

function assertSessionId(value: string): void {
  if (!value.trim()) throw new TypeError("sessionId must be a non-empty string.");
}

function assertRecordTimestamp(timestampMs: number): void {
  if (!Number.isSafeInteger(timestampMs) || !Number.isFinite(new Date(timestampMs).getTime())) {
    throw new RangeError("AVL record timestamp must be a valid integer epoch timestamp.");
  }
}
