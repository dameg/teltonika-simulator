import { Inject, Injectable, OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import {
  Pool,
  type PoolClient,
  type QueryResult,
  type QueryResultRow,
} from "pg";

export const DATABASE_POOL = Symbol("DATABASE_POOL");
const requiredMigration = "000001_initial_persistence";

export function requireDatabaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const value = env.DATABASE_URL?.trim();
  if (!value) {
    throw new Error("DATABASE_URL is required for PostgreSQL persistence");
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use the postgres or postgresql protocol");
  }

  return value;
}

export function createDatabasePool(
  env: NodeJS.ProcessEnv = process.env,
): Pool {
  return new Pool({
    connectionString: requireDatabaseUrl(env),
    max: parsePositiveInteger(env.DATABASE_POOL_MAX, "DATABASE_POOL_MAX", 10),
    connectionTimeoutMillis: parsePositiveInteger(
      env.DATABASE_CONNECTION_TIMEOUT_MS,
      "DATABASE_CONNECTION_TIMEOUT_MS",
      5_000,
    ),
  });
}

@Injectable()
export class DatabaseService implements OnModuleDestroy, OnModuleInit {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  query<TRow extends QueryResultRow = QueryResultRow>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<QueryResult<TRow>> {
    return this.pool.query<TRow>(text, [...values]);
  }

  async onModuleInit(): Promise<void> {
    if (!(await this.hasCurrentSchema())) {
      throw new Error(
        `PostgreSQL persistence schema is missing or outdated; run npm run db:migrate (required: ${requiredMigration})`,
      );
    }
  }

  async withTransaction<T>(
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async isReady(): Promise<boolean> {
    try {
      return await this.hasCurrentSchema();
    } catch {
      return false;
    }
  }

  private async hasCurrentSchema(): Promise<boolean> {
    const relations = await this.query<{
      migrations_table: string | null;
      persistence_schema: string | null;
    }>(
      `SELECT to_regclass('public.avl_frames')::text AS persistence_schema,
              to_regclass('public.pgmigrations')::text AS migrations_table`,
    );
    if (!relations.rows[0]?.persistence_schema || !relations.rows[0]?.migrations_table) return false;
    const migration = await this.query<{ current: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM pgmigrations WHERE name = $1) AS current",
      [requiredMigration],
    );
    return migration.rows[0]?.current === true;
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

function parsePositiveInteger(
  value: string | undefined,
  name: string,
  fallback: number,
): number {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}
