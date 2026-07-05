import { readFileSync } from "node:fs";

import type { RouteDefinition, RouteMetadata, RoutePoint } from "./domain";

export function loadRouteFromFile(filePath: string): RouteDefinition {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (error) {
    throw new Error(`Unable to read route file ${filePath}: ${errorMessage(error)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid route JSON in ${filePath}: ${errorMessage(error)}`);
  }

  return parseRouteDefinition(parsed);
}

export function parseRouteDefinition(value: unknown): RouteDefinition {
  const route = objectAt(value, "route");
  const metadata = parseMetadata(route.metadata);
  if (!Array.isArray(route.points) || route.points.length === 0) {
    throw new Error("route.points must be a non-empty array");
  }

  return {
    metadata,
    points: route.points.map((point, index) => parsePoint(point, `route.points[${index}]`))
  };
}

function parseMetadata(value: unknown): RouteMetadata {
  const metadata = objectAt(value, "route.metadata");
  const id = stringAt(metadata.id, "route.metadata.id");
  return {
    id,
    ...(metadata.name === undefined ? {} : { name: stringAt(metadata.name, "route.metadata.name") }),
    ...(metadata.description === undefined ? {} : { description: stringAt(metadata.description, "route.metadata.description") })
  };
}

function parsePoint(value: unknown, path: string): RoutePoint {
  const point = objectAt(value, path);
  return {
    latitude: coordinateAt(point.latitude, `${path}.latitude`, -90, 90),
    longitude: coordinateAt(point.longitude, `${path}.longitude`, -180, 180),
    ...(point.altitudeMeters === undefined ? {} : { altitudeMeters: numberAt(point.altitudeMeters, `${path}.altitudeMeters`) }),
    ...(point.speedLimitKph === undefined ? {} : { speedLimitKph: positiveNumberAt(point.speedLimitKph, `${path}.speedLimitKph`) }),
    ...(point.stopDurationMs === undefined ? {} : { stopDurationMs: nonNegativeIntegerAt(point.stopDurationMs, `${path}.stopDurationMs`) })
  };
}

function objectAt(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function stringAt(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${path} must be a non-empty string`);
  }
  return value;
}

function numberAt(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number`);
  }
  return value;
}

function coordinateAt(value: unknown, path: string, min: number, max: number): number {
  const number = numberAt(value, path);
  if (number < min || number > max) {
    throw new Error(`${path} must be between ${min} and ${max}`);
  }
  return number;
}

function positiveNumberAt(value: unknown, path: string): number {
  const number = numberAt(value, path);
  if (number <= 0) {
    throw new Error(`${path} must be greater than 0`);
  }
  return number;
}

function nonNegativeIntegerAt(value: unknown, path: string): number {
  const number = numberAt(value, path);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`${path} must be a non-negative integer`);
  }
  return number;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
