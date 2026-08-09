import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";

import { normalizeImei } from "../domain";
import { HistoryRepository } from "./history.repository";
import { parseHistoryQuery, type HistoryQueryInput } from "./history-query";

@Injectable()
export class HistoryService {
  constructor(
    @Inject(HistoryRepository)
    private readonly repository: HistoryRepository,
  ) {}

  listDevices() {
    return this.repository.listDevices();
  }

  listDeviceFrames(imei: string, input: HistoryQueryInput) {
    return this.repository.listDeviceFrames(normalizeImei(imei), parseHistoryQuery(input, "frame"));
  }

  async getFrame(frameId: string) {
    if (!/^[1-9]\d*$/.test(frameId)) {
      throw invalidFrameId();
    }
    const frame = await this.repository.getFrame(frameId);
    if (!frame) {
      throw new NotFoundException({
        error: { code: "FRAME_NOT_FOUND", message: `Frame not found: ${frameId}` },
      });
    }
    return frame;
  }

  listDeviceRecords(imei: string, input: HistoryQueryInput) {
    return this.repository.listDeviceRecords(normalizeImei(imei), parseHistoryQuery(input));
  }

  listDeviceTrips(imei: string, input: HistoryQueryInput) {
    return this.repository.listDeviceTrips(normalizeImei(imei), parseHistoryQuery(input, "trip"));
  }

  listTripRecords(tripId: string, input: HistoryQueryInput) {
    if (!isUuid(tripId)) {
      throw new BadRequestException({
        error: {
          code: "INVALID_TRIP_ID",
          message: "Trip ID must be a UUID.",
        },
      });
    }
    return this.repository.listTripRecords(tripId, parseHistoryQuery(input));
  }

  listTripRoute(tripId: string, maximumPoints: number) {
    if (!isUuid(tripId)) {
      throw new BadRequestException({ error: { code: "INVALID_TRIP_ID", message: "Trip ID must be a UUID." } });
    }
    if (!Number.isSafeInteger(maximumPoints) || maximumPoints < 2 || maximumPoints > 5_000) {
      throw new BadRequestException({
        error: { code: "INVALID_MAX_POINTS", message: "maxPoints must be between 2 and 5000." },
      });
    }
    return this.repository.listTripRoute(tripId, maximumPoints).then((items) => ({ items }));
  }

  async getRecord(recordId: string) {
    if (!/^[1-9]\d*$/.test(recordId)) throw invalidRecordId();
    const record = await this.repository.getRecord(recordId);
    if (!record) {
      throw new NotFoundException({
        error: { code: "RECORD_NOT_FOUND", message: `Record not found: ${recordId}` },
      });
    }
    return record;
  }

  listLiveRecords(afterRecordId = "0", limit = "1000") {
    if (!/^\d+$/.test(afterRecordId)) throw invalidRecordId();
    if (!/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 5_000) {
      throw new BadRequestException({
        error: { code: "INVALID_LIMIT", message: "Limit must be between 1 and 5000." },
      });
    }
    return this.repository.listLiveRecords(afterRecordId, Number(limit));
  }
}

function invalidFrameId(): BadRequestException {
  return new BadRequestException({
    error: { code: "INVALID_FRAME_ID", message: "Frame ID must be a positive integer." },
  });
}

function invalidRecordId(): BadRequestException {
  return new BadRequestException({
    error: { code: "INVALID_RECORD_ID", message: "Record ID must be a positive integer." },
  });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
