require("dotenv").config();
const { query } = require("./db");
query("ALTER TABLE contacts ADD COLUMN city VARCHAR(255);")
  .then(res => {
    console.log("Added city column");
    process.exit(0);
  })
  .catch(err => {
    console.error("Error:", err);
    process.exit(1);
  });
