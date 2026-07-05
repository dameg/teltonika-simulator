import { readFileSync } from "node:fs";

import type { InterpolatedRoutePosition, RouteDefinition, RouteGeometry, RouteMetadata, RoutePoint, RouteSegment } from "./domain";

const earthRadiusMeters = 6_371_000;

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

export function buildRouteGeometry(route: RouteDefinition): RouteGeometry {
  let startDistanceMeters = 0;
  const segments: RouteSegment[] = route.points.map((start, index) => {
    const end = route.points[(index + 1) % route.points.length] ?? start;
    const distanceMeters = distanceBetween(start, end);
    const segment = {
      start,
      end,
      distanceMeters,
      startDistanceMeters,
      endDistanceMeters: startDistanceMeters + distanceMeters,
      headingDegrees: headingBetween(start, end),
      ...(start.speedLimitKph === undefined ? {} : { speedLimitKph: start.speedLimitKph })
    };
    startDistanceMeters += distanceMeters;
    return segment;
  });

  return { route, segments, totalDistanceMeters: startDistanceMeters };
}

export function interpolateRoutePosition(geometry: RouteGeometry, distanceMeters: number): InterpolatedRoutePosition {
  if (!Number.isFinite(distanceMeters)) {
    throw new Error("distanceMeters must be a finite number");
  }

  if (geometry.totalDistanceMeters === 0) {
    return pointPosition(geometry.route.points[0] ?? { latitude: 0, longitude: 0 }, 0, 0, 0);
  }

  const distance = modulo(distanceMeters, geometry.totalDistanceMeters);
  const segmentIndex = geometry.segments.findIndex((segment) => distance < segment.endDistanceMeters);
  const segment = geometry.segments[segmentIndex === -1 ? 0 : segmentIndex];
  if (!segment) {
    throw new Error("route geometry must contain at least one segment");
  }

  const ratio = segment.distanceMeters === 0 ? 0 : (distance - segment.startDistanceMeters) / segment.distanceMeters;
  return {
    latitude: interpolate(segment.start.latitude, segment.end.latitude, ratio),
    longitude: interpolate(segment.start.longitude, segment.end.longitude, ratio),
    altitudeMeters: interpolate(segment.start.altitudeMeters ?? 0, segment.end.altitudeMeters ?? 0, ratio),
    headingDegrees: segment.headingDegrees,
    distanceMeters: distance,
    segmentIndex: segmentIndex === -1 ? 0 : segmentIndex,
    ...(segment.speedLimitKph === undefined ? {} : { speedLimitKph: segment.speedLimitKph })
  };
}

export function interpolateRouteProgress(geometry: RouteGeometry, progressRatio: number): InterpolatedRoutePosition {
  if (!Number.isFinite(progressRatio)) {
    throw new Error("progressRatio must be a finite number");
  }
  return interpolateRoutePosition(geometry, progressRatio * geometry.totalDistanceMeters);
}

function pointPosition(point: RoutePoint, distanceMeters: number, segmentIndex: number, headingDegrees: number): InterpolatedRoutePosition {
  return {
    latitude: point.latitude,
    longitude: point.longitude,
    altitudeMeters: point.altitudeMeters ?? 0,
    headingDegrees,
    distanceMeters,
    segmentIndex,
    ...(point.speedLimitKph === undefined ? {} : { speedLimitKph: point.speedLimitKph })
  };
}

function distanceBetween(start: RoutePoint, end: RoutePoint): number {
  const startLatitude = radians(start.latitude);
  const endLatitude = radians(end.latitude);
  const deltaLatitude = radians(end.latitude - start.latitude);
  const deltaLongitude = radians(end.longitude - start.longitude);
  const a =
    Math.sin(deltaLatitude / 2) ** 2 + Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(deltaLongitude / 2) ** 2;
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function headingBetween(start: RoutePoint, end: RoutePoint): number {
  if (start.latitude === end.latitude && start.longitude === end.longitude) {
    return 0;
  }

  const startLatitude = radians(start.latitude);
  const endLatitude = radians(end.latitude);
  const deltaLongitude = radians(end.longitude - start.longitude);
  const y = Math.sin(deltaLongitude) * Math.cos(endLatitude);
  const x = Math.cos(startLatitude) * Math.sin(endLatitude) - Math.sin(startLatitude) * Math.cos(endLatitude) * Math.cos(deltaLongitude);
  return modulo(degrees(Math.atan2(y, x)), 360);
}

function interpolate(start: number, end: number, ratio: number): number {
  return start + (end - start) * ratio;
}

function radians(degreesValue: number): number {
  return (degreesValue * Math.PI) / 180;
}

function degrees(radiansValue: number): number {
  return (radiansValue * 180) / Math.PI;
}

function modulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
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
