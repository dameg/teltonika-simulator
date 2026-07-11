import {
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
} from "@nestjs/common";

import { DashboardDomainError } from "../domain";
import {
  ActiveDashboardRunConflictError,
  StatusService,
} from "./status.service";

@Controller("api/status")
export class StatusController {
  constructor(
    @Inject(StatusService)
    private readonly statusService: StatusService,
  ) {}

  @Get("devices")
  listDeviceStatuses() {
    return { devices: this.statusService.listDeviceStatuses() };
  }

  @Get("devices/:imei")
  getDeviceStatus(@Param("imei") imei: string) {
    try {
      return { device: this.statusService.getDeviceStatus(imei) };
    } catch (error) {
      throw toHttpException(error);
    }
  }

  @Get("overview")
  getOverview() {
    return this.statusService.getOverview();
  }

  @Get("positions")
  listPositions() {
    return { positions: this.statusService.listPositions() };
  }

  @Get("positions/:imei")
  listDevicePositions(@Param("imei") imei: string) {
    return { positions: this.statusService.listPositions(imei) };
  }

  @Delete("state")
  @HttpCode(204)
  clearDashboardState() {
    try {
      this.statusService.clearDashboardState();
    } catch (error) {
      throw toHttpException(error);
    }
  }
}

function toHttpException(error: unknown): NotFoundException | ConflictException {
  if (error instanceof DashboardDomainError && error.code === "DEVICE_NOT_FOUND") {
    return new NotFoundException({
      error: {
        code: error.code,
        message: error.message,
      },
    });
  }

  if (error instanceof Error && error.message.startsWith("Device not found:")) {
    return new NotFoundException({
      error: {
        code: "DEVICE_NOT_FOUND",
        message: error.message,
      },
    });
  }

  if (error instanceof ActiveDashboardRunConflictError) {
    return new ConflictException({
      error: {
        code: "ACTIVE_RUNS_PRESENT",
        message: error.message,
      },
    });
  }

  throw error;
}
