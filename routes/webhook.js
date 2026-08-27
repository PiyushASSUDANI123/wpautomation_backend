const express = require("express");
const router = express.Router();
const db = require("../db");
const { downloadMediaFromMeta } = require("../services/metaApi");
const { uploadBufferToCloudinary } = require("../services/cloudinaryService");

// ============================================
// GET /webhook — Meta Verification
// ============================================
router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    console.log("✅ Webhook verified successfully");
    return res.status(200).send(challenge);
  }

  console.warn("❌ Webhook verification failed");
  return res.status(403).json({ error: "Verification failed" });
});

// ============================================
// POST /webhook — Inbound Message Receiver
// ============================================
router.post("/", async (req, res) => {
  // Always respond 200 immediately (Meta requirement)
  res.status(200).json({ status: "received" });

  try {
    const body = req.body;

    // Validate it's a WhatsApp message event
    if (
      !body.object ||
      !body.entry ||
      !body.entry[0]?.changes ||
      !body.entry[0]?.changes[0]?.value
    ) {
      return;
    }

    const value = body.entry[0].changes[0].value;

    // Handle incoming messages
    if (value.messages && value.messages.length > 0) {
      for (const message of value.messages) {
        const from = message.from; // Phone number
        const wamid = message.id; // Meta message ID
        const timestamp = message.timestamp;

        // Extract message body based on type
        let messageBody = "";
        let mediaUrl = null;
        let mediaIdToDownload = null;
        let resourceType = "auto";

        if (message.type === "text" && message.text) {
          messageBody = message.text.body;
        } else if (message.type === "image") {
          messageBody = "[Image]";
          mediaIdToDownload = message.image.id;
          resourceType = "image";
        } else if (message.type === "video") {
          messageBody = "[Video]";
          mediaIdToDownload = message.video.id;
          resourceType = "video";
        } else if (message.type === "audio") {
          messageBody = "[Audio]";
          mediaIdToDownload = message.audio.id;
          resourceType = "video";
        } else if (message.type === "document") {
          messageBody = "[Document]";
          mediaIdToDownload = message.document.id;
          resourceType = "raw";
        } else if (message.type === "location") {
          messageBody = "[Location]";
        } else if (message.type === "sticker") {
          messageBody = "[Sticker]";
          mediaIdToDownload = message.sticker.id;
          resourceType = "image";
        } else {
          messageBody = `[${message.type || "Unknown"}]`;
        }

        // Process media if present
        if (mediaIdToDownload) {
          try {
            const mediaData = await downloadMediaFromMeta(mediaIdToDownload);
            if (mediaData && mediaData.buffer) {
              mediaUrl = await uploadBufferToCloudinary(mediaData.buffer, "wp_automation/inbound", resourceType);
            }
          } catch (mediaErr) {
            console.error("❌ Failed to process inbound media:", mediaErr);
          }
        }

        // Get contact name from contacts array if available
        let contactName = null;
        if (value.contacts && value.contacts.length > 0) {
          const contactInfo = value.contacts.find((c) => c.wa_id === from);
          if (contactInfo && contactInfo.profile) {
            contactName = contactInfo.profile.name;
          }
        }

        // Upsert contact
        const contactResult = await db.query(
          `INSERT INTO contacts (phone_number, name)
           VALUES ($1, $2)
           ON CONFLICT (phone_number)
           DO UPDATE SET name = COALESCE($2, contacts.name)
           RETURNING id, phone_number, name`,
          [from, contactName]
        );
        const contact = contactResult.rows[0];

        // Insert inbound message
        const msgResult = await db.query(
          `INSERT INTO messages (contact_id, direction, message_body, media_url, meta_message_id, status, timestamp)
           VALUES ($1, 'inbound', $2, $3, $4, 'delivered', to_timestamp($5))
           RETURNING *`,
          [contact.id, messageBody, mediaUrl, wamid, timestamp]
        );

        const savedMessage = msgResult.rows[0];

        // Emit via Socket.io for real-time UI updates
        const io = req.app.get("io");
        if (io) {
          io.emit("new_message", {
            id: savedMessage.id,
            contact_id: contact.id,
            contact_phone: contact.phone_number,
            contact_name: contact.name,
            direction: "inbound",
            message_body: messageBody,
            media_url: mediaUrl,
            meta_message_id: wamid,
            status: "delivered",
            timestamp: savedMessage.timestamp,
          });
        }

        console.log(`📥 Inbound message from ${from}: "${messageBody.substring(0, 50)}"`);
      }
    }

    // Handle status updates (sent, delivered, read)
    if (value.statuses && value.statuses.length > 0) {
      for (const status of value.statuses) {
        const metaMessageId = status.id;
        const newStatus = status.status; // sent, delivered, read, failed

        if (["sent", "delivered", "read", "failed"].includes(newStatus)) {
          await db.query(
            `UPDATE messages SET status = $1 WHERE meta_message_id = $2`,
            [newStatus, metaMessageId]
          );

          // Emit status update via Socket.io
          const io = req.app.get("io");
          if (io) {
            io.emit("message_status", {
              meta_message_id: metaMessageId,
              status: newStatus,
              recipient: status.recipient_id,
            });
          }
        }
      }
    }
  } catch (err) {
    console.error("❌ Webhook processing error:", err);
  }
});

module.exports = router;
