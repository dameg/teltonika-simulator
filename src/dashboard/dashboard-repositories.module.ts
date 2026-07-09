import { Module } from "@nestjs/common";

import {
  InMemoryDashboardDeviceRepository,
  InMemoryDashboardLogRepository,
  InMemoryDashboardRuntimeRepository,
} from "./repositories";

@Module({
  providers: [
    InMemoryDashboardDeviceRepository,
    InMemoryDashboardRuntimeRepository,
    InMemoryDashboardLogRepository,
  ],
  exports: [
    InMemoryDashboardDeviceRepository,
    InMemoryDashboardRuntimeRepository,
    InMemoryDashboardLogRepository,
  ],
})
export class DashboardRepositoriesModule {}
