import { BadRequestException } from "@nestjs/common";

const defaultPageLimit = 100;
const maximumPageLimit = 500;
const maximumCursorLength = 512;

export interface HistoryCursor {
  kind: "frame" | "record" | "trip";
  timestampMs: number;
  id: string;
}

export interface HistoryQueryInput {
  cursor?: string;
  from?: string;
  limit?: string;
  to?: string;
}

export interface ParsedHistoryQuery {
  cursor?: HistoryCursor;
  from?: Date;
  limit: number;
  to?: Date;
}

export function parseHistoryQuery(
  input: HistoryQueryInput,
  cursorKind: HistoryCursor["kind"] = "record",
): ParsedHistoryQuery {
  const from = optionalDate(input.from, "from");
  const to = optionalDate(input.to, "to");

  if (from && to && from.getTime() > to.getTime()) {
    throw invalidHistoryQuery("Query parameter 'from' must not be later than 'to'.");
  }

  return {
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(input.cursor ? { cursor: decodeHistoryCursor(input.cursor, cursorKind) } : {}),
    limit: parseLimit(input.limit),
  };
}

export function encodeHistoryCursor(cursor: HistoryCursor): string {
  assertCursor(cursor);
  return Buffer.from(
    JSON.stringify({ v: 1, k: cursor.kind, t: cursor.timestampMs, i: cursor.id }),
    "utf8",
  )
    .toString("base64url");
}

export function decodeHistoryCursor(
  value: string,
  expectedKind?: HistoryCursor["kind"],
): HistoryCursor {
  if (
    value.length === 0 ||
    value.length > maximumCursorLength ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw invalidHistoryQuery("Query parameter 'cursor' is invalid.");
  }

  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (!isRecord(decoded) || decoded.v !== 1) {
      throw new Error("unsupported cursor");
    }

    const cursor = { kind: decoded.k, timestampMs: decoded.t, id: decoded.i };
    assertCursor(cursor);
    if (expectedKind && cursor.kind !== expectedKind) {
      throw invalidHistoryQuery("Query parameter 'cursor' belongs to another history resource.");
    }
    return cursor;
  } catch (error) {
    if (error instanceof BadRequestException) {
      throw error;
    }
    throw invalidHistoryQuery("Query parameter 'cursor' is invalid.");
  }
}

function parseLimit(value: string | undefined): number {
  if (value === undefined || value === "") {
    return defaultPageLimit;
  }

  if (!/^\d+$/.test(value)) {
    throw invalidHistoryQuery("Query parameter 'limit' must be a positive integer.");
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximumPageLimit) {
    throw invalidHistoryQuery(
      `Query parameter 'limit' must be between 1 and ${maximumPageLimit}.`,
    );
  }
  return parsed;
}

function optionalDate(value: string | undefined, field: "from" | "to"): Date | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }

  const timestampMs = Date.parse(value);
  if (!isIsoTimestamp(value) || !Number.isFinite(timestampMs)) {
    throw invalidHistoryQuery(`Query parameter '${field}' must be an ISO-8601 timestamp.`);
  }
  return new Date(timestampMs);
}

function assertCursor(cursor: unknown): asserts cursor is HistoryCursor {
  if (
    !isRecord(cursor) ||
    (cursor.kind !== "frame" && cursor.kind !== "record" && cursor.kind !== "trip") ||
    !Number.isSafeInteger(cursor.timestampMs) ||
    typeof cursor.id !== "string" ||
    !/^[A-Za-z0-9-]{1,64}$/.test(cursor.id)
  ) {
    throw invalidHistoryQuery("Query parameter 'cursor' is invalid.");
  }
}

function isIsoTimestamp(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidHistoryQuery(message: string): BadRequestException {
  return new BadRequestException({
    error: {
      code: "INVALID_HISTORY_QUERY",
      message,
    },
  });
}
