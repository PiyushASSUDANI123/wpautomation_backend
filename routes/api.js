const express = require("express");
const router = express.Router();


const { getAccountHealth } = require("../services/metaApi");

router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

router.get("/account-health", async (req, res) => {
  try {
    const result = await getAccountHealth();
    if (result.success) {
      res.json(result.data);
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (err) {
    console.error("❌ Account health route error:", err);
    res.status(500).json({ error: "Failed to fetch account health" });
  }
});

module.exports = router;
