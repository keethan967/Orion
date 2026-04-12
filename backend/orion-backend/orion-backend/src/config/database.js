// src/config/database.js
// PostgreSQL connection pool with environment-aware SSL config

const { Pool } = require('pg');

const isProduction = process.env.NODE_ENV === 'production';

const poolConfig = {
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'orion_db',
  user:     process.env.DB_USER     || 'orion_user',
  password: process.env.DB_PASSWORD,
  max:      20,          // max pool connections
  idleTimeoutMillis:    30000,
  connectionTimeoutMillis: 2000,
};

// Use DATABASE_URL if provided (Heroku / Railway style)
if (process.env.DATABASE_URL) {
  poolConfig.connectionString = process.env.DATABASE_URL;
  delete poolConfig.host;
  delete poolConfig.port;
  delete poolConfig.database;
  delete poolConfig.user;
  delete poolConfig.password;
}

// SSL in production
if (isProduction || process.env.DB_SSL === 'true') {
  poolConfig.ssl = { rejectUnauthorized: false };
}

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

/**
 * Execute a parameterized query.
 * @param {string} text - SQL query with $1, $2 placeholders
 * @param {Array}  params - Query parameters
 */
async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV === 'development' && duration > 200) {
    console.warn(`[DB] Slow query (${duration}ms): ${text.slice(0, 80)}`);
  }
  return res;
}

/**
 * Get a client for transactions.
 * Always call client.release() in a finally block.
 */
async function getClient() {
  return pool.connect();
}

module.exports = { query, getClient, pool };
