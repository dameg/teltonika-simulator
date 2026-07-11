import { Module } from "@nestjs/common";

import {
  InMemoryDashboardDeviceRepository,
  InMemoryDashboardLogRepository,
  InMemoryDashboardPositionRepository,
  InMemoryDashboardRuntimeRepository,
} from "./repositories";

@Module({
  providers: [
    InMemoryDashboardDeviceRepository,
    InMemoryDashboardRuntimeRepository,
    InMemoryDashboardLogRepository,
    InMemoryDashboardPositionRepository,
  ],
  exports: [
    InMemoryDashboardDeviceRepository,
    InMemoryDashboardRuntimeRepository,
    InMemoryDashboardLogRepository,
    InMemoryDashboardPositionRepository,
  ],
})
export class DashboardRepositoriesModule {}
