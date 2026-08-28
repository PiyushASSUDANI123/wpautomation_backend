const express = require("express");
const router = express.Router();
const multer = require("multer");
const db = require("../db");
const { uploadFileToCloudinary } = require("../services/cloudinaryService");
const { uploadMediaToMeta } = require("../services/metaApi");
const os = require("os");

const upload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`);
    },
  }),
  limits: { fileSize: 16 * 1024 * 1024 }, 
});


router.get("/", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM media_assets ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ List media error:", err);
    res.status(500).json({ error: err.message });
  }
});


router.post("/", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file provided" });
    }

    let resourceType = "auto";
    if (req.file.mimetype.startsWith("image/")) resourceType = "image";
    if (req.file.mimetype.startsWith("video/")) resourceType = "video";

    
    const mediaUrl = await uploadFileToCloudinary(req.file.path, "wp_automation/library", resourceType);

    
    let metaMediaId = null;
    try {
      metaMediaId = await uploadMediaToMeta(req.file.path, req.file.mimetype);
    } catch (metaErr) {
      console.warn("⚠️ Meta upload failed, continuing with Cloudinary only:", metaErr.message);
    }

    
    const result = await db.query(
      `INSERT INTO media_assets (original_name, media_url, meta_media_id, resource_type)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.file.originalname, mediaUrl, metaMediaId, resourceType]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("❌ Media upload error:", err);
    res.status(500).json({ error: err.message });
  }
});


router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await db.query(`DELETE FROM media_assets WHERE id = $1`, [id]);
    res.json({ message: "Media deleted successfully" });
  } catch (err) {
    console.error("❌ Media delete error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
