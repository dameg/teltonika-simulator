import { Controller, Get, Inject, Param, Query } from "@nestjs/common";

import { HistoryService } from "./history.service";

@Controller("api/history")
export class HistoryController {
  constructor(
    @Inject(HistoryService)
    private readonly historyService: HistoryService,
  ) {}

  @Get("devices")
  async listDevices() {
    return { devices: await this.historyService.listDevices() };
  }

  @Get("devices/:imei/frames")
  async listDeviceFrames(
    @Param("imei") imei: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.historyService.listDeviceFrames(imei, { from, to, cursor, limit });
  }

  @Get("frames/:frameId")
  async getFrame(@Param("frameId") frameId: string) {
    return { frame: await this.historyService.getFrame(frameId) };
  }

  @Get("devices/:imei/records")
  async listDeviceRecords(
    @Param("imei") imei: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.historyService.listDeviceRecords(imei, { from, to, cursor, limit });
  }

  @Get("devices/:imei/trips")
  async listDeviceTrips(
    @Param("imei") imei: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.historyService.listDeviceTrips(imei, { from, to, cursor, limit });
  }

  @Get(["trips/:tripId/records", "trips/:tripId/route"])
  async listTripRecords(
    @Param("tripId") tripId: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.historyService.listTripRecords(tripId, { from, to, cursor, limit });
  }
}
