const axios = require("axios");

const META_API_BASE = `https://graph.facebook.com/${process.env.META_API_VERSION}`;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;

/**
 * Send a template message via Meta Cloud API
 * @param {string} to - Recipient phone number (with country code, no +)
 * @param {string} templateName - Template name registered in Meta
 * @param {string} languageCode - Template language code (e.g., "en_US")
 * @param {Array} components - Template components (optional)
 * @returns {Promise<object>} Meta API response
 */
const sendTemplateMessage = async (to, templateName, languageCode = "en_US", components = []) => {
  try {
    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
      },
    };

    if (components.length > 0) {
      payload.template.components = components;
    }

    const response = await axios.post(
      `${META_API_BASE}/${PHONE_NUMBER_ID}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    return {
      success: true,
      messageId: response.data.messages?.[0]?.id || null,
      data: response.data,
    };
  } catch (err) {
    console.error("❌ Meta API sendTemplate error:", err.response?.data || err.message);
    return {
      success: false,
      error: err.response?.data?.error?.message || err.message,
    };
  }
};

/**
 * Send a free-form text message (only within 24h window)
 * @param {string} to - Recipient phone number
 * @param {string} text - Message text
 * @returns {Promise<object>} Meta API response
 */
const sendTextMessage = async (to, text) => {
  try {
    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    };

    const response = await axios.post(
      `${META_API_BASE}/${PHONE_NUMBER_ID}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    return {
      success: true,
      messageId: response.data.messages?.[0]?.id || null,
      data: response.data,
    };
  } catch (err) {
    console.error("❌ Meta API sendText error:", err.response?.data || err.message);
    return {
      success: false,
      error: err.response?.data?.error?.message || err.message,
    };
  }
};

const fs = require("fs");
const FormData = require("form-data");

/**
 * Upload a media file to Meta WhatsApp Cloud API
 * @param {string} filePath - Path to the local file
 * @param {string} mimeType - MIME type of the file
 * @returns {Promise<string|null>} Media ID or null if failed
 */
const uploadMediaToMeta = async (filePath, mimeType) => {
  try {
    const formData = new FormData();
    formData.append("file", fs.createReadStream(filePath));
    formData.append("type", mimeType);
    formData.append("messaging_product", "whatsapp");

    const response = await axios.post(
      `${META_API_BASE}/${PHONE_NUMBER_ID}/media`,
      formData,
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          ...formData.getHeaders(),
        },
      }
    );

    return response.data.id;
  } catch (err) {
    console.error("❌ Meta API media upload error:", err.response?.data || err.message);
    return null;
  }
};

/**
 * Download media from Meta WhatsApp Cloud API
 * @param {string} mediaId - The Meta media ID
 * @returns {Promise<{buffer: Buffer, mimeType: string}|null>}
 */
const downloadMediaFromMeta = async (mediaId) => {
  try {
    // 1. Get media URL
    const urlResponse = await axios.get(
      `${META_API_BASE}/${mediaId}`,
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
        },
      }
    );

    const mediaUrl = urlResponse.data.url;
    const mimeType = urlResponse.data.mime_type;

    if (!mediaUrl) {
      throw new Error("No media URL returned");
    }

    // 2. Download media binary
    const mediaResponse = await axios.get(mediaUrl, {
      responseType: "arraybuffer",
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
      },
    });

    return {
      buffer: Buffer.from(mediaResponse.data, "binary"),
      mimeType,
    };
  } catch (err) {
    console.error("❌ Meta API download media error:", err.response?.data || err.message);
    return null;
  }
};

const WABA_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;

/**
 * Fetch approved templates from Meta WhatsApp Cloud API
 * @returns {Promise<Array>} List of templates
 */
const getTemplates = async () => {
  try {
    const response = await axios.get(
      `${META_API_BASE}/${WABA_ID}/message_templates`,
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
        },
        params: {
          limit: 100, // Fetch up to 100 templates
        }
      }
    );

    // Only return approved templates
    const approvedTemplates = response.data.data.filter(t => t.status === 'APPROVED');
    return approvedTemplates;
  } catch (err) {
    console.error("❌ Meta API getTemplates error:", err.response?.data || err.message);
    throw new Error(err.response?.data?.error?.message || err.message);
  }
};
/**
 * Create a new message template in Meta
 * @param {string} name - Template name
 * @param {string} language - Language code (e.g., "en_US")
 * @param {string} category - Category (e.g., "MARKETING")
 * @param {string} text - Body text of the template
 * @returns {Promise<object>} Created template data
 */
const createTemplate = async (name, language, category, text) => {
  try {
    const payload = {
      name: name.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
      language,
      category,
      components: [
        {
          type: "BODY",
          text: text,
        },
      ],
    };

    const response = await axios.post(
      `${META_API_BASE}/${WABA_ID}/message_templates`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
    return response.data;
  } catch (err) {
    console.error("❌ Meta API createTemplate error:", err.response?.data || err.message);
    throw new Error(err.response?.data?.error?.user_msg || err.response?.data?.error?.message || err.message);
  }
};

module.exports = { sendTemplateMessage, sendTextMessage, uploadMediaToMeta, downloadMediaFromMeta, getTemplates, createTemplate };
