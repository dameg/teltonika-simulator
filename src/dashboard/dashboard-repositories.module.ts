import { Module } from "@nestjs/common";

import { DatabaseModule } from "./persistence/database.module";
import {
  DASHBOARD_STORE,
  PostgresDashboardStore,
} from "./persistence/dashboard-store";
import { PostgresFrameStore } from "./persistence/frame-store";
import { RuntimeConfigRegistry } from "./runtime/runtime-config-registry";

@Module({
  imports: [DatabaseModule],
  providers: [
    PostgresDashboardStore,
    PostgresFrameStore,
    RuntimeConfigRegistry,
    { provide: DASHBOARD_STORE, useExisting: PostgresDashboardStore },
  ],
  exports: [
    DASHBOARD_STORE,
    PostgresDashboardStore,
    PostgresFrameStore,
    RuntimeConfigRegistry,
  ],
})
export class DashboardRepositoriesModule {}
