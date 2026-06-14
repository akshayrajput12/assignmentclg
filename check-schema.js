require("dotenv").config();
const { Pool } = require("pg");

const p = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
});

async function main() {
  const c = await p.connect();
  try {
    // Check columns for each table
    const cols = await c.query(`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `);
    
    const byTable = {};
    cols.rows.forEach(r => {
      if (!byTable[r.table_name]) byTable[r.table_name] = [];
      byTable[r.table_name].push(r.column_name + ":" + r.data_type);
    });
    
    console.log("Schema:\n" + JSON.stringify(byTable, null, 2));
  } finally {
    c.release();
    await p.end();
  }
}
main().catch(e => { console.error(e.message); process.exit(1); });
