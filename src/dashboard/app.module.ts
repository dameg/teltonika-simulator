import { Module } from "@nestjs/common";

import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { DeviceManagementModule } from "./device-management/device-management.module";
import { LoggingModule } from "./logging/logging.module";
import { RuntimeModule } from "./runtime/runtime.module";
import { StatusModule } from "./status/status.module";

@Module({
  imports: [DeviceManagementModule, RuntimeModule, StatusModule, LoggingModule],
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule {}
