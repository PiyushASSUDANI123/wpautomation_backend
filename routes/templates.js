const express = require("express");
const router = express.Router();
const { getTemplates } = require("../services/metaApi");

// ============================================
// GET /api/templates — Fetch approved Meta templates
// ============================================
router.get("/", async (req, res) => {
  try {
    const templates = await getTemplates();
    res.json(templates);
  } catch (err) {
    console.error("❌ Fetch templates error:", err);
    // If the error is due to invalid credentials or missing WABA ID, return a mock or empty list,
    // or just pass the error to the client to show a warning.
    res.status(500).json({ error: err.message || "Failed to fetch templates" });
  }
});
// ============================================
// POST /api/templates — Create a new Meta template
// ============================================
router.post("/", async (req, res) => {
  try {
    const { name, language, category, text, headerType } = req.body;
    
    if (!name || !language || !category || !text) {
      return res.status(400).json({ error: "Missing required fields: name, language, category, text" });
    }

    const result = await require("../services/metaApi").createTemplate(name, language, category, text, headerType);
    res.json({ success: true, data: result });
  } catch (err) {
    console.error("❌ Create template error:", err);
    res.status(500).json({ error: err.message || "Failed to create template" });
  }
});

module.exports = router;
