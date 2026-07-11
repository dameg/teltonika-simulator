import { normalizeImei, type DashboardPosition } from "../domain";

const maxPointsPerDevice = 1_000;

export class InMemoryDashboardPositionRepository {
  private readonly positions = new Map<string, DashboardPosition[]>();

  append(position: DashboardPosition): DashboardPosition {
    const imei = normalizeImei(position.imei);
    const points = this.positions.get(imei) ?? [];
    const next = { ...position, imei };

    points.push(next);
    if (points.length > maxPointsPerDevice) points.splice(0, points.length - maxPointsPerDevice);
    this.positions.set(imei, points);
    return { ...next };
  }

  list(imei?: string): DashboardPosition[] {
    const points = imei
      ? this.positions.get(normalizeImei(imei)) ?? []
      : [...this.positions.values()].flat();
    return points.map((point) => ({ ...point }));
  }

  clearByDevice(imei: string): void {
    this.positions.delete(normalizeImei(imei));
  }

  clear(): void {
    this.positions.clear();
  }
}
