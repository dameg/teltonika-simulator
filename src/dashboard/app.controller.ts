import { Controller, Get, Header, Inject, ServiceUnavailableException } from "@nestjs/common";

import { AppService } from "./app.service";

@Controller()
export class AppController {
  constructor(@Inject(AppService) private readonly appService: AppService) {}

  @Get()
  @Header("Content-Type", "text/html; charset=utf-8")
  getShell(): string {
    return this.appService.renderShellHtml();
  }

  @Get(["api/health", "api/health/live"])
  getLiveness() {
    return this.appService.getLiveness();
  }

  @Get("api/health/ready")
  async getReadiness() {
    const readiness = await this.appService.getReadiness();
    if (readiness.status !== "ok") throw new ServiceUnavailableException(readiness);
    return readiness;
  }
}
