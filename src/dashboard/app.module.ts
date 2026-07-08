import { Module } from "@nestjs/common";

import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { DeviceManagementModule } from "./device-management/device-management.module";

@Module({
  imports: [DeviceManagementModule],
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule {}
