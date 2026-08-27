const express = require("express");
const router = express.Router();
const multer = require("multer");
const XLSX = require("xlsx");
const db = require("../db");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
});

// GET /api/contact_lists — List all saved sheets
router.get("/", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT cl.*, COUNT(clm.contact_id) as member_count
       FROM contact_lists cl
       LEFT JOIN contact_list_members clm ON cl.id = clm.list_id
       GROUP BY cl.id
       ORDER BY cl.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ List contact_lists error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/contact_lists — Upload Excel and save as a named list
router.post("/", upload.single("file"), async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: "List name is required" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Excel/CSV file is required" });
    }

    // Parse the uploaded file
    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    const phoneNumbers = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row && row[0]) {
        let phone = String(row[0]).trim().replace(/[^0-9]/g, "");
        if (phone.length >= 10) {
          phoneNumbers.push(phone);
        }
      }
    }

    if (phoneNumbers.length === 0) {
      return res.status(400).json({ error: "No valid phone numbers found in the file" });
    }

    const uniquePhones = [...new Set(phoneNumbers)];

    // 1. Create the list
    const listResult = await db.query(
      `INSERT INTO contact_lists (name) VALUES ($1) RETURNING *`,
      [name]
    );
    const list = listResult.rows[0];

    // 2. Upsert contacts and add to list members
    let addedCount = 0;
    for (const phone of uniquePhones) {
      const contactResult = await db.query(
        `INSERT INTO contacts (phone_number)
         VALUES ($1)
         ON CONFLICT (phone_number) DO UPDATE SET phone_number = $1
         RETURNING id`,
        [phone]
      );
      
      const contactId = contactResult.rows[0].id;
      
      try {
        await db.query(
          `INSERT INTO contact_list_members (list_id, contact_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [list.id, contactId]
        );
        addedCount++;
      } catch (e) {
        // Ignore duplicate key errors for members
      }
    }

    res.status(201).json({
      message: "Contact list saved successfully",
      list: {
        id: list.id,
        name: list.name,
        member_count: addedCount,
        created_at: list.created_at,
      },
    });
  } catch (err) {
    console.error("❌ Contact list creation error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
