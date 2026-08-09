import { Injectable } from "@nestjs/common";

import type { DashboardDeviceRecord } from "../domain";

@Injectable()
export class RuntimeConfigRegistry {
  private readonly devices = new Map<string, DashboardDeviceRecord>();

  get(imei: string): DashboardDeviceRecord | undefined {
    const device = this.devices.get(imei);
    return device ? structuredClone(device) : undefined;
  }

  set(device: DashboardDeviceRecord): void {
    this.devices.set(device.imei, structuredClone(device));
  }

  delete(imei: string): void {
    this.devices.delete(imei);
  }
}
