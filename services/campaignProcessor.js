const db = require("../db");
const { sendTemplateMessage } = require("./metaApi");

let bullmqAvailable = false;
let Queue, Worker;

// Try to load BullMQ (requires Redis)
try {
  const bullmq = require("bullmq");
  Queue = bullmq.Queue;
  Worker = bullmq.Worker;
  bullmqAvailable = true;
} catch (err) {
  console.warn("⚠️  BullMQ not available, using in-memory queue fallback");
}

// ============================================
// BullMQ-based processor (Redis required)
// ============================================

let campaignQueue = null;
let campaignWorker = null;

const initBullMQ = (io) => {
  if (!bullmqAvailable) return false;

  try {
    const IORedis = require("ioredis");
    const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
      maxRetriesPerRequest: null,
      retryStrategy: () => null, // Don't retry if connection fails initially
    });

    connection.on("error", (err) => {
      console.warn("⚠️ Redis connection error (will fallback to in-memory):", err.message);
      bullmqAvailable = false;
    });

    campaignQueue = new Queue("campaign-messages", { connection });

    campaignWorker = new Worker(
      "campaign-messages",
      async (job) => {
        const { to, templateName, languageCode, campaignId, contactId, mediaId, mediaType } = job.data;

        let components = [];
        if (mediaId && mediaType) {
          components.push({
            type: "header",
            parameters: [
              {
                type: mediaType,
                [mediaType]: { id: mediaId },
              },
            ],
          });
        }

        const result = await sendTemplateMessage(to, templateName, languageCode, components);

        // Save message to DB
        await db.query(
          `INSERT INTO messages (campaign_id, contact_id, direction, message_body, meta_message_id, status, timestamp)
           VALUES ($1, $2, 'outbound', $3, $4, $5, NOW())`,
          [
            campaignId,
            contactId,
            `[Template: ${templateName}]`,
            result.messageId || null,
            result.success ? "sent" : "failed",
          ]
        );

        // Update campaign total_sent
        if (result.success) {
          await db.query(
            `UPDATE campaigns SET total_sent = total_sent + 1 WHERE id = $1`,
            [campaignId]
          );
        }

        // Emit progress via Socket.io
        if (io) {
          io.emit("campaign_progress", {
            campaignId,
            phone: to,
            success: result.success,
            error: result.error || null,
          });
        }

        return result;
      },
      {
        connection,
        limiter: {
          max: 50,
          duration: 1000, // 50 messages per second
        },
      }
    );

    campaignWorker.on("failed", (job, err) => {
      console.error(`❌ Campaign job ${job.id} failed:`, err.message);
    });

    console.log("✅ BullMQ campaign worker initialized");
    return true;
  } catch (err) {
    console.warn("⚠️  Redis connection failed, falling back to in-memory queue:", err.message);
    bullmqAvailable = false;
    return false;
  }
};

// ============================================
// In-memory fallback processor
// ============================================

const processInMemory = async (messages, campaignId, templateName, languageCode, io, mediaId = null, mediaType = null) => {
  const BATCH_SIZE = 50;
  const DELAY_MS = 1000; // 1 second between batches

  let components = [];
  if (mediaId && mediaType) {
    components.push({
      type: "header",
      parameters: [
        {
          type: mediaType,
          [mediaType]: { id: mediaId },
        },
      ],
    });
  }

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);

    const promises = batch.map(async ({ to, contactId }) => {
      const result = await sendTemplateMessage(to, templateName, languageCode, components);

      await db.query(
        `INSERT INTO messages (campaign_id, contact_id, direction, message_body, meta_message_id, status, timestamp)
         VALUES ($1, $2, 'outbound', $3, $4, $5, NOW())`,
        [
          campaignId,
          contactId,
          `[Template: ${templateName}]`,
          result.messageId || null,
          result.success ? "sent" : "failed",
        ]
      );

      if (result.success) {
        await db.query(
          `UPDATE campaigns SET total_sent = total_sent + 1 WHERE id = $1`,
          [campaignId]
        );
      }

      if (io) {
        io.emit("campaign_progress", {
          campaignId,
          phone: to,
          success: result.success,
          error: result.error || null,
        });
      }

      return result;
    });

    await Promise.allSettled(promises);

    // Delay between batches
    if (i + BATCH_SIZE < messages.length) {
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    }
  }
};

// ============================================
// Main processor entry point
// ============================================

/**
 * Process a campaign — enqueue or process messages
 * @param {Array<{to: string, contactId: string}>} messages - List of recipients
 * @param {string} campaignId - Campaign UUID
 * @param {string} templateName - Meta template name
 * @param {string} languageCode - Template language
 * @param {string} mediaId - Meta media ID (optional)
 * @param {string} mediaType - Media type: image/video/document (optional)
 */
const processCampaign = async (messages, campaignId, templateName, languageCode, io, mediaId = null, mediaType = null) => {
  if (bullmqAvailable && campaignQueue) {
    // BullMQ path
    console.log(`📨 Enqueueing ${messages.length} messages via BullMQ`);
    for (const msg of messages) {
      await campaignQueue.add("send-template", {
        to: msg.to,
        contactId: msg.contactId,
        templateName,
        languageCode,
        campaignId,
        mediaId,
        mediaType,
      });
    }
  } else {
    // In-memory fallback
    console.log(`📨 Processing ${messages.length} messages in-memory`);
    // Run in background (don't await)
    processInMemory(messages, campaignId, templateName, languageCode, io, mediaId, mediaType).catch((err) => {
      console.error("❌ In-memory campaign processing error:", err);
    });
  }
};

module.exports = { initBullMQ, processCampaign };
