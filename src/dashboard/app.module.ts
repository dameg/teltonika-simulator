import { Module } from "@nestjs/common";

import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { DeviceManagementModule } from "./device-management/device-management.module";
import { RuntimeModule } from "./runtime/runtime.module";

@Module({
  imports: [DeviceManagementModule, RuntimeModule],
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule {}
