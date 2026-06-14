import "dotenv/config";
import { defineConfig } from "prisma/config";

// In Neon, the pooler URL works for both migrations and queries.
// The non-pooler URL may be blocked on some networks/firewalls.
const dbUrl =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/postgres";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: dbUrl,
  },
});
