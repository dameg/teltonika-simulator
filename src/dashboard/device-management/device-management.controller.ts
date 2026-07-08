import {
  BadRequestException,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Body,
  Inject
} from "@nestjs/common";

import { DashboardDomainError } from "../domain";
import {
  DeviceManagementService,
  isDeviceStateConflictError
} from "./device-management.service";

@Controller("api/devices")
export class DeviceManagementController {
  constructor(
    @Inject(DeviceManagementService)
    private readonly deviceManagementService: DeviceManagementService
  ) {}

  @Get()
  listDevices() {
    return { devices: this.deviceManagementService.listDevices() };
  }

  @Post()
  createDevice(@Body() body: unknown) {
    try {
      return { device: this.deviceManagementService.createDevice(asRecord(body)) };
    } catch (error) {
      throw toHttpException(error);
    }
  }

  @Post("import")
  bulkImport(@Body() body: unknown) {
    try {
      return { devices: this.deviceManagementService.bulkImport(asRecord(body)) };
    } catch (error) {
      throw toHttpException(error);
    }
  }

  @Patch(":imei")
  updateDevice(@Param("imei") imei: string, @Body() body: unknown) {
    try {
      return { device: this.deviceManagementService.updateDevice(imei, asRecord(body)) };
    } catch (error) {
      throw toHttpException(error);
    }
  }

  @Delete(":imei")
  @HttpCode(204)
  deleteDevice(@Param("imei") imei: string) {
    try {
      this.deviceManagementService.deleteDevice(imei);
    } catch (error) {
      throw toHttpException(error);
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BadRequestException({
      error: {
        code: "INVALID_REQUEST",
        message: "Request body must be a JSON object"
      }
    });
  }

  return value as Record<string, unknown>;
}

function toHttpException(error: unknown): BadRequestException | ConflictException | NotFoundException {
  if (error instanceof BadRequestException) {
    return error;
  }

  if (error instanceof DashboardDomainError) {
    const response = {
      error: {
        code: error.code,
        message: error.message
      }
    };

    if (error.code === "DEVICE_NOT_FOUND") {
      return new NotFoundException(response);
    }

    if (error.code === "DUPLICATE_IMEI") {
      return new ConflictException(response);
    }

    return new BadRequestException(response);
  }

  if (isDeviceStateConflictError(error)) {
    return new ConflictException({
      error: {
        code: "DEVICE_RUNNING",
        message: error.message
      }
    });
  }

  if (error instanceof Error) {
    return new BadRequestException({
      error: {
        code: "INVALID_REQUEST",
        message: error.message
      }
    });
  }

  return new BadRequestException({
    error: {
      code: "INVALID_REQUEST",
      message: "Request could not be processed"
    }
  });
}
