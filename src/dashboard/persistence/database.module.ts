import { Global, Module } from "@nestjs/common";

import {
  createDatabasePool,
  DATABASE_POOL,
  DatabaseService,
} from "./database.service";

export { DATABASE_POOL, DatabaseService } from "./database.service";

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_POOL,
      useFactory: createDatabasePool,
    },
    DatabaseService,
  ],
  exports: [DATABASE_POOL, DatabaseService],
})
export class DatabaseModule {}
