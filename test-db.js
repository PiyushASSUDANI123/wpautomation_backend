require("dotenv").config();
const { Pool } = require("pg");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
pool.query("SELECT * FROM users LIMIT 1")
  .then(res => {
    console.log("DB Test Success:", res.rows);
    process.exit(0);
  })
  .catch(err => {
    console.error("DB Test Error:", err);
    process.exit(1);
  });
