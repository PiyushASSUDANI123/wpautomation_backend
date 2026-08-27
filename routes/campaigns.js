const express = require("express");
const router = express.Router();
const multer = require("multer");
const XLSX = require("xlsx");
const { v4: uuidv4 } = require("uuid");
const db = require("../db");
const { processCampaign } = require("../services/campaignProcessor");
const { uploadFileToCloudinary } = require("../services/cloudinaryService");

// Configure multer for file uploads (in memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
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
const { uploadMediaToMeta } = require("../services/metaApi");

const uploadMedia = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`);
    }
  }),
  limits: { fileSize: 16 * 1024 * 1024 }, // 16MB limit for WhatsApp media
});

// ============================================
// POST /api/campaigns — Create Campaign from Saved List
// ============================================
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
      // Fallback in case it's a single string id somehow
      parsedListIds = [contact_list_ids];
    }

    if (!Array.isArray(parsedListIds) || parsedListIds.length === 0) {
      return res.status(400).json({ error: "No contact lists selected" });
    }

    // Handle optional media upload
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

      // Upload to Meta
      media_id = await uploadMediaToMeta(req.file.path, req.file.mimetype);
      if (!media_id) {
        return res.status(500).json({ error: "Failed to upload media to WhatsApp Meta API." });
      }

      // Upload to Cloudinary
      try {
        let resourceType = "auto";
        if (media_type === "image") resourceType = "image";
        if (media_type === "video") resourceType = "video";
        media_url = await uploadFileToCloudinary(req.file.path, "wp_automation/campaigns", resourceType);
      } catch (uploadErr) {
        console.error("Cloudinary upload failed, proceeding without URL:", uploadErr);
      }
    }

    // Verify contact lists exist and get unique members
    const membersResult = await db.query(
      `SELECT DISTINCT c.id, c.phone_number
       FROM contact_list_members clm
       JOIN contacts c ON clm.contact_id = c.id
       WHERE clm.list_id = ANY($1::uuid[])`,
      [parsedListIds]
    );

    if (membersResult.rows.length === 0) {
      return res.status(400).json({ error: "Selected contact lists are empty or do not exist" });
    }

    // Create campaign record
    // Store only the first list_id in the DB for backward compatibility if needed, 
    // or just store the array if DB column is altered. For now, since column is UUID, store first one.
    const campaignResult = await db.query(
      `INSERT INTO campaigns (name, template_name, contact_list_id, media_id, media_type, media_url, total_sent)
       VALUES ($1, $2, $3, $4, $5, $6, 0)
       RETURNING *`,
      [name, template_name, parsedListIds[0], media_id, media_type, media_url]
    );
    const campaign = campaignResult.rows[0];

    // Prepare message list
    const messages = membersResult.rows.map(member => ({
      to: member.phone_number,
      contactId: member.id,
    }));

    // Process campaign (enqueue or in-memory)
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

// ============================================
// GET /api/campaigns — List All Campaigns
// ============================================
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

// ============================================
// GET /api/campaigns/:id — Single Campaign Detail
// ============================================
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

// ============================================
// GET /api/campaigns/:id/recipients — Campaign Recipients
// ============================================
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

module.exports = router;
