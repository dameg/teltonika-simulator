import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Post,
} from "@nestjs/common";

import { DashboardDomainError } from "../domain";
import { RuntimeService } from "./runtime.service";

interface SelectedDevicesBody {
  imeis?: unknown;
}

@Controller("api/runtime")
export class RuntimeController {
  constructor(
    @Inject(RuntimeService)
    private readonly runtimeService: RuntimeService,
  ) {}

  @Post("devices/:imei/start")
  @HttpCode(HttpStatus.OK)
  startDevice(@Param("imei") imei: string) {
    return this.execute(() => this.runtimeService.startDevice(imei));
  }

  @Post("devices/:imei/stop")
  @HttpCode(HttpStatus.OK)
  stopDevice(@Param("imei") imei: string) {
    return this.execute(() => this.runtimeService.stopDevice(imei));
  }

  @Post("start-selected")
  @HttpCode(HttpStatus.OK)
  startSelected(@Body() body: SelectedDevicesBody) {
    const imeis = parseImeis(body.imeis);
    return this.execute(() => this.runtimeService.startSelectedDevices(imeis));
  }

  @Post("start-all-enabled")
  @HttpCode(HttpStatus.OK)
  startAllEnabled() {
    return this.execute(() => this.runtimeService.startAllEnabledDevices());
  }

  @Post("stop-all")
  @HttpCode(HttpStatus.OK)
  stopAll() {
    return this.execute(() => this.runtimeService.stopAllDevices());
  }

  private execute<T>(operation: () => T): T {
    try {
      return operation();
    } catch (error) {
      throw mapRuntimeError(error, this.runtimeService);
    }
  }
}

function parseImeis(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new HttpException(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "Request body must include imeis as an array of strings.",
        },
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  return value;
}

function mapRuntimeError(error: unknown, runtimeService: RuntimeService): HttpException {
  if (error instanceof HttpException) {
    return error;
  }

  if (runtimeService.isActiveRunConflict(error)) {
    return new HttpException(
      {
        error: {
          code: "RUN_ALREADY_ACTIVE",
          message: error.message,
        },
      },
      HttpStatus.CONFLICT,
    );
  }

  if (error instanceof DashboardDomainError) {
    const status =
      error.code === "DEVICE_NOT_FOUND" || error.code === "RUN_NOT_FOUND"
        ? HttpStatus.NOT_FOUND
        : HttpStatus.BAD_REQUEST;

    return new HttpException(
      {
        error: {
          code: error.code,
          message: error.message,
        },
      },
      status,
    );
  }

  return new HttpException(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Unexpected runtime error.",
      },
    },
    HttpStatus.INTERNAL_SERVER_ERROR,
  );
}
