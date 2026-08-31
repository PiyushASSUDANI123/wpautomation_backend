const express = require("express");
const router = express.Router();
const multer = require("multer");
const XLSX = require("xlsx");
const { v4: uuidv4 } = require("uuid");
const db = require("../db");
const { processCampaign } = require("../services/campaignProcessor");
const { uploadFileToCloudinary } = require("../services/cloudinaryService");


const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, 
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
    ];
    if (allowedTypes.includes(file.mimetype) || file.originalname.match(/\.(xlsx|xls|csv)$/i)) {
      cb(null, true);
    } else {
      cb(new Error("Only Excel (.xlsx, .xls) and CSV files are allowed"));
    }
  },
});

const os = require("os");
const path = require("path");
const { uploadMediaToMeta, getTemplates } = require("../services/metaApi");

const uploadMedia = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`);
    }
  }),
  limits: { fileSize: 16 * 1024 * 1024 }, 
});




router.post("/", uploadMedia.single("mediaFile"), async (req, res) => {
  try {
    const { name, template_name, language_code, contact_list_ids } = req.body;

    if (!name || !template_name || !contact_list_ids) {
      return res.status(400).json({ error: "Campaign name, template_name, and contact_list_ids are required" });
    }

    let parsedListIds = [];
    try {
      parsedListIds = JSON.parse(contact_list_ids);
    } catch (e) {
      
      parsedListIds = [contact_list_ids];
    }

    if (!Array.isArray(parsedListIds) || parsedListIds.length === 0) {
      return res.status(400).json({ error: "No contact lists selected" });
    }

    
    let media_id = null;
    let media_type = null;
    let media_url = null;

    if (req.file) {
      if (req.file.mimetype.startsWith("image/")) {
        media_type = "image";
      } else if (req.file.mimetype.startsWith("video/")) {
        media_type = "video";
      } else {
        media_type = "document";
      }

      
      media_id = await uploadMediaToMeta(req.file.path, req.file.mimetype);
      if (!media_id) {
        return res.status(500).json({ error: "Failed to upload media to WhatsApp Meta API." });
      }

      
      try {
        let resourceType = "auto";
        if (media_type === "image") resourceType = "image";
        if (media_type === "video") resourceType = "video";
        media_url = await uploadFileToCloudinary(req.file.path, "wp_automation/campaigns", resourceType);
      } catch (uploadErr) {
        console.error("Cloudinary upload failed, proceeding without URL:", uploadErr);
      }
    }

    
    const membersResult = await db.query(
      `SELECT DISTINCT c.id, c.phone_number, c.name, c.city
       FROM contact_list_members clm
       JOIN contacts c ON clm.contact_id = c.id
       WHERE clm.list_id = ANY($1::uuid[])`,
      [parsedListIds]
    );

    if (membersResult.rows.length === 0) {
      return res.status(400).json({ error: "Selected contact lists are empty or do not exist" });
    }

    
    
    
    const campaignResult = await db.query(
      `INSERT INTO campaigns (name, template_name, contact_list_id, media_id, media_type, media_url, total_sent)
       VALUES ($1, $2, $3, $4, $5, $6, 0)
       RETURNING *`,
      [name, template_name, parsedListIds[0], media_id, media_type, media_url]
    );
    const campaign = campaignResult.rows[0];

    // Determine how many parameters the template needs
    let paramCount = 0;
    try {
      const templates = await getTemplates();
      const tpl = templates.find(t => t.name === template_name);
      if (tpl) {
        const bodyComponent = tpl.components.find(c => c.type === 'BODY');
        if (bodyComponent && bodyComponent.text) {
          const matches = bodyComponent.text.match(/\\{\\{\\d+\\}\\}/g);
          if (matches) paramCount = matches.length;
        }
      }
    } catch (err) {
      console.warn("Could not fetch templates to check params:", err.message);
    }

    
    const messages = membersResult.rows.map(member => {
      const bodyParams = [];
      if (paramCount >= 1) {
        bodyParams.push({ type: "text", text: member.name || "Customer" });
      }
      if (paramCount >= 2) {
        bodyParams.push({ type: "text", text: member.city || "Special Offer" });
      }
      for (let i = 2; i < paramCount; i++) {
        bodyParams.push({ type: "text", text: "Update" }); // Generic fallback for extra params
      }

      return {
        to: member.phone_number,
        contactId: member.id,
        bodyParams
      };
    });

    
    const io = req.app.get("io");
    await processCampaign(
      messages, 
      campaign.id, 
      template_name, 
      language_code || "en_US", 
      io,
      media_id,
      media_type
    );

    // Auto-delete older campaigns, keeping only the last 50
    try {
      await db.query(`
        DELETE FROM campaigns 
        WHERE id NOT IN (
          SELECT id FROM campaigns 
          ORDER BY created_at DESC 
          LIMIT 50
        )
      `);
    } catch (cleanupErr) {
      console.error("Cleanup error (auto-delete older than 50 campaigns):", cleanupErr);
    }

    res.status(201).json({
      message: "Campaign created and processing started",
      campaign: {
        id: campaign.id,
        name: campaign.name,
        template_name: campaign.template_name,
        total_recipients: messages.length,
        created_at: campaign.created_at,
      },
    });
  } catch (err) {
    console.error("❌ Campaign creation error:", err);
    res.status(500).json({ error: err.message });
  }
});




router.get("/", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
        c.*,
        COUNT(m.id) as total_messages,
        COUNT(CASE WHEN m.status = 'delivered' THEN 1 END) as total_delivered,
        COUNT(CASE WHEN m.status = 'read' THEN 1 END) as total_read,
        COUNT(CASE WHEN m.status = 'failed' THEN 1 END) as total_failed
      FROM campaigns c
      LEFT JOIN messages m ON m.campaign_id = c.id
      GROUP BY c.id
      ORDER BY c.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ List campaigns error:", err);
    res.status(500).json({ error: err.message });
  }
});




router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const campaignResult = await db.query(`SELECT * FROM campaigns WHERE id = $1`, [id]);
    if (campaignResult.rows.length === 0) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    const statsResult = await db.query(
      `SELECT
        status,
        COUNT(*) as count
      FROM messages
      WHERE campaign_id = $1
      GROUP BY status`,
      [id]
    );

    res.json({
      ...campaignResult.rows[0],
      stats: statsResult.rows,
    });
  } catch (err) {
    console.error("❌ Campaign detail error:", err);
    res.status(500).json({ error: err.message });
  }
});




router.get("/:id/recipients", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `SELECT m.id, c.phone_number, c.name, m.status, m.timestamp
       FROM messages m
       JOIN contacts c ON m.contact_id = c.id
       WHERE m.campaign_id = $1
       ORDER BY m.timestamp DESC`,
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Campaign recipients error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    // Safely delete related messages first to avoid foreign key constraints
    await db.query("DELETE FROM messages WHERE campaign_id = $1", [id]);
    
    const result = await db.query("DELETE FROM campaigns WHERE id = $1 RETURNING *", [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    res.json({ message: "Campaign deleted successfully" });
  } catch (err) {
    console.error("❌ Campaign deletion error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
