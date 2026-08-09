import { Module } from "@nestjs/common";

import {
  InMemoryDashboardDeviceRepository,
  InMemoryDashboardConfigRevisionRepository,
  InMemoryDashboardJourneyRepository,
  InMemoryDashboardLogRepository,
  InMemoryDashboardPositionRepository,
  InMemoryDashboardRuntimeRepository,
} from "./repositories";

@Module({
  providers: [
    InMemoryDashboardDeviceRepository,
    InMemoryDashboardConfigRevisionRepository,
    InMemoryDashboardJourneyRepository,
    InMemoryDashboardRuntimeRepository,
    InMemoryDashboardLogRepository,
    InMemoryDashboardPositionRepository,
  ],
  exports: [
    InMemoryDashboardDeviceRepository,
    InMemoryDashboardConfigRevisionRepository,
    InMemoryDashboardJourneyRepository,
    InMemoryDashboardRuntimeRepository,
    InMemoryDashboardLogRepository,
    InMemoryDashboardPositionRepository,
  ],
})
export class DashboardRepositoriesModule {}
