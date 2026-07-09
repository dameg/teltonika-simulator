import { Module } from "@nestjs/common";

import { DashboardRepositoriesModule } from "../dashboard-repositories.module";
import { StatusController } from "./status.controller";
import { StatusService } from "./status.service";

@Module({
  imports: [DashboardRepositoriesModule],
  controllers: [StatusController],
  providers: [StatusService],
})
export class StatusModule {}
