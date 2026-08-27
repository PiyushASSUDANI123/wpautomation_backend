const express = require("express");
const router = express.Router();

// GET /api/health
router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Example: GET /api/data
router.get("/data", (req, res) => {
  res.json({
    message: "Sample data from backend",
    data: [],
  });
});

module.exports = router;
