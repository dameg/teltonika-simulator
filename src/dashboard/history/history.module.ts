import { Module } from "@nestjs/common";

import { DatabaseModule } from "../persistence/database.module";
import { HistoryController } from "./history.controller";
import { PublicHistoryController } from "./public-history.controller";
import { HistoryRepository } from "./history.repository";
import { HistoryService } from "./history.service";

@Module({
  imports: [DatabaseModule],
  controllers: [HistoryController, PublicHistoryController],
  providers: [HistoryRepository, HistoryService],
  exports: [HistoryRepository, HistoryService],
})
export class HistoryModule {}
