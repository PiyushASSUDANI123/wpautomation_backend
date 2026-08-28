const express = require("express");
const router = express.Router();
const multer = require("multer");
const XLSX = require("xlsx");
const db = require("../db");
const { uploadExcelToSupabase } = require("../services/supabaseService");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, 
});


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


router.post("/", upload.single("file"), async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: "List name is required" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Excel/CSV file is required" });
    }

    
    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    
    
    let fileUrl = null;
    try {
      const filename = `${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
      fileUrl = await uploadExcelToSupabase(req.file.buffer, filename);
    } catch (uploadErr) {
      console.error("Failed to upload Excel to Supabase, continuing without URL:", uploadErr);
    }
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    const contactsToSave = [];
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row && row.length >= 3) {
        let name = String(row[1] || "").trim(); // Column B: Name
        let phone = String(row[2] || "").trim().replace(/[^0-9]/g, ""); // Column C: Mobile
        let city = String(row[3] || "").trim(); // Column D: City
        
        // Prepend 91 to 10 digit Indian numbers
        if (phone.length === 10) {
          phone = "91" + phone;
        }

        if (phone.length >= 10) {
          contactsToSave.push({ name, phone, city });
        }
      }
    }

    if (contactsToSave.length === 0) {
      return res.status(400).json({ error: "No valid phone numbers found. Please ensure S.No, Name, Mobile Number, City format." });
    }

    
    const uniqueMap = new Map();
    for (const c of contactsToSave) {
      if (!uniqueMap.has(c.phone)) {
        uniqueMap.set(c.phone, c);
      }
    }
    const uniqueContacts = Array.from(uniqueMap.values());

    
    const listResult = await db.query(
      `INSERT INTO contact_lists (name, file_url) VALUES ($1, $2) RETURNING *`,
      [name, fileUrl]
    );
    const list = listResult.rows[0];

    
    let addedCount = 0;
    for (const contact of uniqueContacts) {
      const contactResult = await db.query(
        `INSERT INTO contacts (phone_number, name, city)
         VALUES ($1, $2, $3)
         ON CONFLICT (phone_number) DO UPDATE SET 
           name = COALESCE(NULLIF(EXCLUDED.name, ''), contacts.name),
           city = COALESCE(NULLIF(EXCLUDED.city, ''), contacts.city)
         RETURNING id`,
        [contact.phone, contact.name, contact.city]
      );
      
      const contactId = contactResult.rows[0].id;
      
      try {
        await db.query(
          `INSERT INTO contact_list_members (list_id, contact_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [list.id, contactId]
        );
        addedCount++;
      } catch (e) {
        
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


router.get("/:id/contacts", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `SELECT c.id, c.phone_number, c.name, c.city, c.created_at
       FROM contact_list_members clm
       JOIN contacts c ON clm.contact_id = c.id
       WHERE clm.list_id = $1
       ORDER BY c.created_at DESC`,
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ List contacts error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
