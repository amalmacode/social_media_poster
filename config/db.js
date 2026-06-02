const { Pool } = require('pg');
const { env } = require('./env');

const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: env.isProduction ? { rejectUnauthorized: false } : false
});

async function query(text, params) {
  const started = Date.now();
  try {
    const result = await pool.query(text, params);
    if (Date.now() - started > 500) console.warn('Slow query', { text, ms: Date.now() - started });
    return result;
  } catch (error) {
    console.error('Database query failed', { text, error: error.message });
    throw error;
  }
}

module.exports = { pool, query };
