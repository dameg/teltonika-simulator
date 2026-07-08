import { Module } from "@nestjs/common";

import {
  InMemoryDashboardDeviceRepository,
  InMemoryDashboardLogRepository,
  InMemoryDashboardRuntimeRepository
} from "../repositories";
import { DeviceManagementController } from "./device-management.controller";
import { DeviceManagementService } from "./device-management.service";

@Module({
  controllers: [DeviceManagementController],
  providers: [
    {
      provide: InMemoryDashboardDeviceRepository,
      useFactory: () => new InMemoryDashboardDeviceRepository()
    },
    {
      provide: InMemoryDashboardRuntimeRepository,
      useFactory: () => new InMemoryDashboardRuntimeRepository()
    },
    {
      provide: InMemoryDashboardLogRepository,
      useFactory: () => new InMemoryDashboardLogRepository()
    },
    DeviceManagementService
  ]
})
export class DeviceManagementModule {}
