const express = require("express");
const router = express.Router();
const db = require("../db");




router.get("/", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
        c.id,
        c.phone_number,
        c.name,
        c.created_at,
        m.message_body as last_message,
        m.direction as last_message_direction,
        m.timestamp as last_message_time,
        (
          SELECT COUNT(*)
          FROM messages m2
          WHERE m2.contact_id = c.id
            AND m2.direction = 'inbound'
            AND m2.status != 'read'
        ) as unread_count
      FROM contacts c
      LEFT JOIN LATERAL (
        SELECT message_body, direction, timestamp
        FROM messages
        WHERE contact_id = c.id
        ORDER BY timestamp DESC
        LIMIT 1
      ) m ON true
      ORDER BY m.timestamp DESC NULLS LAST`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ List contacts error:", err);
    res.status(500).json({ error: err.message });
  }
});




router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(`SELECT * FROM contacts WHERE id = $1`, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Contact not found" });
    }

    
    const lastInbound = await db.query(
      `SELECT timestamp FROM messages
       WHERE contact_id = $1 AND direction = 'inbound'
       ORDER BY timestamp DESC
       LIMIT 1`,
      [id]
    );

    const contact = result.rows[0];
    contact.last_inbound_at = lastInbound.rows[0]?.timestamp || null;
    contact.window_open =
      lastInbound.rows[0]?.timestamp &&
      new Date() - new Date(lastInbound.rows[0].timestamp) < 24 * 60 * 60 * 1000;

    res.json(contact);
  } catch (err) {
    console.error("❌ Contact detail error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
