const express = require("express");
const router = express.Router();
const db = require("../db");
const { sendTextMessage, sendTemplateMessage } = require("../services/metaApi");




router.get("/inbound", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT m.*, c.phone_number, c.name
       FROM messages m
       JOIN contacts c ON m.contact_id = c.id
       WHERE m.direction = 'inbound'
       ORDER BY m.timestamp DESC
       LIMIT 100`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Get inbound messages error:", err);
    res.status(500).json({ error: err.message });
  }
});




router.get("/:contactId", async (req, res) => {
  try {
    const { contactId } = req.params;
    const { limit = 100, offset = 0 } = req.query;

    
    const contactResult = await db.query(`SELECT * FROM contacts WHERE id = $1`, [contactId]);
    if (contactResult.rows.length === 0) {
      return res.status(404).json({ error: "Contact not found" });
    }

    
    const messagesResult = await db.query(
      `SELECT * FROM messages
       WHERE contact_id = $1
       ORDER BY timestamp ASC
       LIMIT $2 OFFSET $3`,
      [contactId, parseInt(limit), parseInt(offset)]
    );

    
    const lastInbound = await db.query(
      `SELECT timestamp FROM messages
       WHERE contact_id = $1 AND direction = 'inbound'
       ORDER BY timestamp DESC
       LIMIT 1`,
      [contactId]
    );

    const lastInboundAt = lastInbound.rows[0]?.timestamp || null;
    const windowOpen = lastInboundAt
      ? new Date() - new Date(lastInboundAt) < 24 * 60 * 60 * 1000
      : false;

    res.json({
      contact: contactResult.rows[0],
      messages: messagesResult.rows,
      window: {
        open: windowOpen,
        last_inbound_at: lastInboundAt,
        expires_at: lastInboundAt
          ? new Date(new Date(lastInboundAt).getTime() + 24 * 60 * 60 * 1000)
          : null,
      },
    });
  } catch (err) {
    console.error("❌ Get messages error:", err);
    res.status(500).json({ error: err.message });
  }
});




router.post("/:contactId", async (req, res) => {
  try {
    const { contactId } = req.params;
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: "Message text is required" });
    }

    
    const contactResult = await db.query(`SELECT * FROM contacts WHERE id = $1`, [contactId]);
    if (contactResult.rows.length === 0) {
      return res.status(404).json({ error: "Contact not found" });
    }
    const contact = contactResult.rows[0];

    
    const lastInbound = await db.query(
      `SELECT timestamp FROM messages
       WHERE contact_id = $1 AND direction = 'inbound'
       ORDER BY timestamp DESC
       LIMIT 1`,
      [contactId]
    );

    if (!lastInbound.rows[0]) {
      return res.status(403).json({
        error: "No inbound messages from this contact. Send a template to start the conversation.",
        window_closed: true,
      });
    }

    const lastInboundTime = new Date(lastInbound.rows[0].timestamp);
    const hoursSinceLastInbound = (new Date() - lastInboundTime) / (1000 * 60 * 60);

    if (hoursSinceLastInbound > 24) {
      return res.status(403).json({
        error: "24-hour window closed. Send a template to restart chat.",
        window_closed: true,
        last_inbound_at: lastInbound.rows[0].timestamp,
        hours_ago: Math.round(hoursSinceLastInbound),
      });
    }

    
    const result = await sendTextMessage(contact.phone_number, message.trim());

    if (!result.success) {
      return res.status(502).json({
        error: "Failed to send message via Meta API",
        details: result.error,
      });
    }

    
    const msgResult = await db.query(
      `INSERT INTO messages (contact_id, direction, message_body, meta_message_id, status, timestamp)
       VALUES ($1, 'outbound', $2, $3, 'sent', NOW())
       RETURNING *`,
      [contactId, message.trim(), result.messageId]
    );

    const savedMessage = msgResult.rows[0];

    
    const io = req.app.get("io");
    if (io) {
      io.emit("new_message", {
        id: savedMessage.id,
        contact_id: contactId,
        contact_phone: contact.phone_number,
        contact_name: contact.name,
        direction: "outbound",
        message_body: message.trim(),
        meta_message_id: result.messageId,
        status: "sent",
        timestamp: savedMessage.timestamp,
      });
    }

    res.status(201).json(savedMessage);
  } catch (err) {
    console.error("❌ Send message error:", err);
    res.status(500).json({ error: err.message });
  }
});




router.post("/:contactId/template", async (req, res) => {
  try {
    const { contactId } = req.params;
    const { template_name, language_code = "en_US", components = [] } = req.body;

    if (!template_name) {
      return res.status(400).json({ error: "template_name is required" });
    }

    
    const contactResult = await db.query(`SELECT * FROM contacts WHERE id = $1`, [contactId]);
    if (contactResult.rows.length === 0) {
      return res.status(404).json({ error: "Contact not found" });
    }
    const contact = contactResult.rows[0];

    
    const result = await sendTemplateMessage(
      contact.phone_number,
      template_name,
      language_code,
      components
    );

    if (!result.success) {
      return res.status(502).json({
        error: "Failed to send template via Meta API",
        details: result.error,
      });
    }

    
    const msgResult = await db.query(
      `INSERT INTO messages (contact_id, direction, message_body, meta_message_id, status, timestamp)
       VALUES ($1, 'outbound', $2, $3, 'sent', NOW())
       RETURNING *`,
      [contactId, `[Template: ${template_name}]`, result.messageId]
    );

    const savedMessage = msgResult.rows[0];

    
    const io = req.app.get("io");
    if (io) {
      io.emit("new_message", {
        id: savedMessage.id,
        contact_id: contactId,
        contact_phone: contact.phone_number,
        contact_name: contact.name,
        direction: "outbound",
        message_body: `[Template: ${template_name}]`,
        meta_message_id: result.messageId,
        status: "sent",
        timestamp: savedMessage.timestamp,
      });
    }

    res.status(201).json(savedMessage);
  } catch (err) {
    console.error("❌ Send template error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
