require("dotenv").config();
const { Pool } = require("pg");

const p = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
  connectionTimeoutMillis: 15000,
});

async function main() {
  const c = await p.connect();
  try {
    const r = await c.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"
    );
    console.log("Tables:", r.rows.map((x) => x.tablename));

    if (r.rows.length === 0) {
      console.log("No tables found — creating schema...");
      await createSchema(c);
    } else {
      console.log("✅ Tables already exist.");
    }
  } finally {
    c.release();
    await p.end();
  }
}

async function createSchema(c) {
  await c.query(`
    CREATE TABLE IF NOT EXISTS "User" (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      name TEXT UNIQUE NOT NULL,
      email TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS "Group" (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      name TEXT NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS "GroupMember" (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "groupId" TEXT NOT NULL REFERENCES "Group"(id) ON DELETE CASCADE,
      "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
      "joinedAt" TIMESTAMPTZ NOT NULL,
      "leftAt" TIMESTAMPTZ,
      UNIQUE("groupId", "userId")
    );

    CREATE TABLE IF NOT EXISTS "Expense" (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "groupId" TEXT NOT NULL REFERENCES "Group"(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      amount DOUBLE PRECISION NOT NULL,
      currency TEXT NOT NULL,
      "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
      "amountInr" DOUBLE PRECISION NOT NULL,
      date TIMESTAMPTZ NOT NULL,
      "paidById" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
      "splitType" TEXT NOT NULL,
      notes TEXT,
      "isDuplicate" BOOLEAN NOT NULL DEFAULT false,
      "duplicateOf" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS "ExpenseSplit" (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "expenseId" TEXT NOT NULL REFERENCES "Expense"(id) ON DELETE CASCADE,
      "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
      amount DOUBLE PRECISION NOT NULL,
      share DOUBLE PRECISION,
      UNIQUE("expenseId", "userId")
    );

    CREATE TABLE IF NOT EXISTS "Payment" (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      date TIMESTAMPTZ NOT NULL,
      amount DOUBLE PRECISION NOT NULL,
      currency TEXT NOT NULL DEFAULT 'INR',
      "fromUserId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
      "toUserId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
      notes TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  console.log("✅ Schema created successfully!");
}

main().catch((e) => {
  console.error("FAILED:", e.message, e.stack);
  process.exit(1);
});
