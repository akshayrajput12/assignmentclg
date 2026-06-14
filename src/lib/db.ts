import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/postgres";

// Singleton pool — prevents connection explosions on Next.js hot-reloads in dev
export const pool: Pool =
  globalThis.__pgPool ??
  new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    // Keep pool small to avoid exhausting Neon's pooler connection limit
    max: 3,
    idleTimeoutMillis: 20000,
    connectionTimeoutMillis: 10000,
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__pgPool = pool;
}

// PrismaClient singleton for read queries (findMany, findUnique, etc.)
// All write transactions use pool.connect() with raw SQL instead of prisma.$transaction()
const adapter = new PrismaPg(pool);

export const prisma: PrismaClient =
  globalThis.__prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}
