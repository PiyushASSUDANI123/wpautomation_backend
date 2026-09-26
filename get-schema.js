require("dotenv").config();
const { query } = require("./db");
query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'contacts'")
  .then(res => {
    console.log("Contacts Schema:", res.rows);
    process.exit(0);
  });
