const express = require("express");
const router = express.Router();


router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});


router.get("/data", (req, res) => {
  res.json({
    message: "Sample data from backend",
    data: [],
  });
});

module.exports = router;
