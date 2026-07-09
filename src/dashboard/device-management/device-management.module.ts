import { Module } from "@nestjs/common";

import { DashboardRepositoriesModule } from "../dashboard-repositories.module";
import { DeviceManagementController } from "./device-management.controller";
import { DeviceManagementService } from "./device-management.service";

@Module({
  imports: [DashboardRepositoriesModule],
  controllers: [DeviceManagementController],
  providers: [DeviceManagementService]
})
export class DeviceManagementModule {}
