import { Controller, Get, Header, Inject } from "@nestjs/common";

import { AppService } from "./app.service";

@Controller()
export class AppController {
  constructor(@Inject(AppService) private readonly appService: AppService) {}

  @Get()
  @Header("Content-Type", "text/html; charset=utf-8")
  getShell(): string {
    return this.appService.renderShellHtml();
  }

  @Get("api/health")
  getHealth() {
    return this.appService.getHealth();
  }
}
