const { query } = require('../config/db');

async function create({ email, passwordHash }) {
  const { rows } = await query(
    'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING *',
    [email, passwordHash]
  );
  return rows[0];
}

async function findByEmail(email) {
  const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
  return rows[0] || null;
}

async function findById(id) {
  const { rows } = await query('SELECT id, email, created_at FROM users WHERE id = $1', [id]);
  return rows[0] || null;
}

module.exports = { create, findByEmail, findById };
