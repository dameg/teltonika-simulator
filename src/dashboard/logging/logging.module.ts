import { Module } from "@nestjs/common";

import { DashboardRepositoriesModule } from "../dashboard-repositories.module";
import { LoggingController } from "./logging.controller";
import { LoggingService } from "./logging.service";

@Module({
  imports: [DashboardRepositoriesModule],
  controllers: [LoggingController],
  providers: [LoggingService],
})
export class LoggingModule {}
