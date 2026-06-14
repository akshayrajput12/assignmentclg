// Quick test: Try connecting to Neon via pg directly
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
  connectionTimeoutMillis: 15000,
});

async function main() {
  console.log("Testing connection to:", process.env.DATABASE_URL?.replace(/:[^:@]+@/, ":***@"));
  
  const client = await pool.connect();
  try {
    const result = await client.query("SELECT NOW(), current_database(), version()");
    console.log("✅ Connected successfully!");
    console.log("Time:", result.rows[0].now);
    console.log("Database:", result.rows[0].current_database);
    
    // Check existing tables
    const tables = await client.query(`
      SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename
    `);
    console.log("Existing tables:", tables.rows.map(r => r.tablename));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => {
  console.error("❌ Connection failed:", e.message);
  process.exit(1);
});
