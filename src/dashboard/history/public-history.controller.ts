import { BadRequestException, Controller, Get, Inject, Param, Query } from "@nestjs/common";

import { HistoryService } from "./history.service";

@Controller("api")
export class PublicHistoryController {
  constructor(@Inject(HistoryService) private readonly history: HistoryService) {}

  @Get("trips")
  listTrips(
    @Query("imei") imei?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    if (!imei) throw missingImei();
    return this.history.listDeviceTrips(imei, { from, to, cursor, limit });
  }

  @Get("trips/:tripId/records")
  listTripRecords(
    @Param("tripId") tripId: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.history.listTripRecords(tripId, { from, to, cursor, limit });
  }

  @Get("trips/:tripId/route")
  listRoute(@Param("tripId") tripId: string, @Query("maxPoints") maxPoints?: string) {
    return this.history.listTripRoute(tripId, maxPoints === undefined ? 1_000 : Number(maxPoints));
  }

  @Get("frames")
  listFrames(
    @Query("imei") imei?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    if (!imei) throw missingImei();
    return this.history.listDeviceFrames(imei, { from, to, cursor, limit });
  }

  @Get("frames/:frameId")
  async getFrame(@Param("frameId") frameId: string) {
    return { frame: await this.history.getFrame(frameId) };
  }

  @Get("records/:recordId")
  async getRecord(@Param("recordId") recordId: string) {
    return { record: await this.history.getRecord(recordId) };
  }

  @Get("routes/live")
  async listLive(
    @Query("afterRecordId") afterRecordId?: string,
    @Query("limit") limit?: string,
  ) {
    const records = await this.history.listLiveRecords(afterRecordId, limit);
    return {
      records,
      nextRecordId: records.at(-1)?.id ?? afterRecordId ?? "0",
    };
  }
}

function missingImei(): BadRequestException {
  return new BadRequestException({
    error: { code: "IMEI_REQUIRED", message: "Query parameter 'imei' is required." },
  });
}
