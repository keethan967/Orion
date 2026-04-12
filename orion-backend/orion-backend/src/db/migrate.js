// src/db/migrate.js
// Run with: node src/db/migrate.js
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { pool } = require('../config/database');

async function migrate() {
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  // Create migrations tracking table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id       SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      run_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
  `);

  for (const file of files) {
    const result = await pool.query(
      'SELECT id FROM _migrations WHERE filename = $1', [file]
    );
    if (result.rows.length > 0) {
      console.log(`  ↩  Already applied: ${file}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    try {
      await pool.query(sql);
      await pool.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
      console.log(`  ✓  Applied: ${file}`);
    } catch (err) {
      console.error(`  ✗  Failed: ${file}`);
      console.error(err.message);
      process.exit(1);
    }
  }

  console.log('\nAll migrations complete.');
  await pool.end();
}

migrate().catch(err => { console.error(err); process.exit(1); });
