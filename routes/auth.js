const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "fallback_super_secret_key_for_gau_shala";

const db = require("../db");



router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const result = await db.query(
      "SELECT * FROM users WHERE username = $1 AND password = $2",
      [username, password]
    );

    if (result.rows.length > 0) {
      const user = result.rows[0];
      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: "24h" }
      );
      
      return res.json({
        message: "Login successful",
        token,
        user: { id: user.id, username: user.username, role: user.role }
      });
    }

    return res.status(401).json({ error: "Invalid username or password" });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
});


router.put("/profile", async (req, res) => {
  const { currentUsername, currentPassword, newUsername, newPassword } = req.body;

  try {
    
    const checkResult = await db.query(
      "SELECT id FROM users WHERE username = $1 AND password = $2",
      [currentUsername, currentPassword]
    );

    if (checkResult.rows.length === 0) {
      return res.status(401).json({ error: "Current credentials do not match." });
    }

    const userId = checkResult.rows[0].id;

    
    await db.query(
      "UPDATE users SET username = $1, password = $2 WHERE id = $3",
      [newUsername, newPassword, userId]
    );

    res.json({ message: "Profile updated successfully." });
  } catch (error) {
    console.error("Profile update error:", error);
    if (error.code === '23505') {
      return res.status(400).json({ error: "Username already exists." });
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
