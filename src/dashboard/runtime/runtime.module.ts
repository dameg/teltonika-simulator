import { Module } from "@nestjs/common";

import { DashboardRepositoriesModule } from "../dashboard-repositories.module";
import { RuntimeController } from "./runtime.controller";
import { RuntimeService } from "./runtime.service";

@Module({
  imports: [DashboardRepositoriesModule],
  controllers: [RuntimeController],
  providers: [RuntimeService],
})
export class RuntimeModule {}
