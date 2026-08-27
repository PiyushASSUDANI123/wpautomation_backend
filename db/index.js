const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Log connection events
pool.on("connect", () => {
  console.log("📦 Connected to PostgreSQL");
});

pool.on("error", (err) => {
  console.error("❌ PostgreSQL pool error:", err.message);
});

/**
 * Execute a query against the database
 * @param {string} text - SQL query text
 * @param {Array} params - Query parameters
 * @returns {Promise<import('pg').QueryResult>}
 */
const query = async (text, params) => {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV === "development") {
    console.log("🔍 Query:", { text: text.substring(0, 80), duration: `${duration}ms`, rows: res.rowCount });
  }
  return res;
};

/**
 * Get a client from the pool for transactions
 * @returns {Promise<import('pg').PoolClient>}
 */
const getClient = async () => {
  return await pool.connect();
};

module.exports = { query, getClient, pool };
