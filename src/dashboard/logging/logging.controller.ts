import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Query,
} from "@nestjs/common";

import { LoggingService } from "./logging.service";

@Controller("api/logs")
export class LoggingController {
  constructor(
    @Inject(LoggingService)
    private readonly loggingService: LoggingService,
  ) {}

  @Get()
  listEvents(
    @Query("imei") imei?: string,
    @Query("severity") severity?: string,
    @Query("type") type?: string,
    @Query("limit") limit?: string,
  ) {
    try {
      return {
        events: this.loggingService.listEvents({ imei, severity, type, limit }),
      };
    } catch (error) {
      throw toHttpException(error);
    }
  }

  @Delete()
  @HttpCode(204)
  clearAllEvents() {
    this.loggingService.clearAllEvents();
  }

  @Delete("devices/:imei")
  @HttpCode(204)
  clearDeviceEvents(@Param("imei") imei: string) {
    try {
      this.loggingService.clearDeviceEvents(imei);
    } catch (error) {
      throw toHttpException(error);
    }
  }
}

function toHttpException(error: unknown) {
  if (error instanceof Error && error.message.startsWith("Device not found:")) {
    return new NotFoundException({
      error: {
        code: "DEVICE_NOT_FOUND",
        message: error.message,
      },
    });
  }

  throw error;
}
