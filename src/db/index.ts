import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://classroom:classroom@localhost:5439/classroom";

// Reuse the connection across HMR reloads in dev — Next.js re-evaluates
// modules on every edit and postgres-js connections would otherwise pile up.
const globalForDb = globalThis as unknown as {
  __classroomSql?: ReturnType<typeof postgres>;
};

const sql =
  globalForDb.__classroomSql ?? postgres(connectionString, { max: 10 });
if (process.env.NODE_ENV !== "production") {
  globalForDb.__classroomSql = sql;
}

export const db = drizzle(sql, { schema });
export * from "./schema";
