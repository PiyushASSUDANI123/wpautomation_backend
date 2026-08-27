require("dotenv").config();
const { query } = require("./db");
query("SELECT m.contact_id, c.phone_number, m.status, m.error_message FROM messages m JOIN contacts c ON m.contact_id = c.id WHERE m.status = 'failed' ORDER BY m.created_at DESC LIMIT 5")
  .then(res => {
    console.log("Failed Messages:", res.rows);
    process.exit(0);
  });
