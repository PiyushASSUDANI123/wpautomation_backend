const axios = require("axios");

const META_API_BASE = `https://graph.facebook.com/${process.env.META_API_VERSION}`;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;

const sendTemplateMessage = async (to, templateName, languageCode = "en_US", components = []) => {
  try {
    // Sanitize phone number - remove +, spaces, dashes, etc.
    const sanitizedTo = to ? to.replace(/\D/g, '') : "";
    if (!sanitizedTo) {
      console.error(`❌ Invalid phone number: "${to}"`);
      return { success: false, error: `Invalid phone number: "${to}"` };
    }

    console.log(`📤 Sending template "${templateName}" to ${sanitizedTo}`);

    const payload = {
      messaging_product: "whatsapp",
      to: sanitizedTo,
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

    console.log(`✅ Message sent to ${sanitizedTo}, ID: ${response.data.messages?.[0]?.id}`);
    return {
      success: true,
      messageId: response.data.messages?.[0]?.id || null,
      data: response.data,
    };
  } catch (err) {
    console.error(`❌ Meta API sendTemplate error for ${to}:`, err.response?.data || err.message);
    return {
      success: false,
      error: err.response?.data?.error?.message || err.message,
    };
  }
};

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

const sendMediaMessage = async (to, mediaUrl, type = "image") => {
  try {
    const sanitizedTo = to ? to.replace(/\D/g, '') : "";
    const payload = {
      messaging_product: "whatsapp",
      to: sanitizedTo,
      type,
      [type]: { link: mediaUrl },
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
    console.error("❌ Meta API sendMedia error:", err.response?.data || err.message);
    return {
      success: false,
      error: err.response?.data?.error?.message || err.message,
    };
  }
};

const fs = require("fs");
const FormData = require("form-data");

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

const downloadMediaFromMeta = async (mediaId) => {
  try {
    
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

const getTemplates = async () => {
  try {
    const response = await axios.get(
      `${META_API_BASE}/${WABA_ID}/message_templates`,
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
        },
        params: {
          limit: 100,
          fields: "name,status,category,language,components,id,last_updated_time",
        }
      }
    );

    
    return response.data.data || [];
  } catch (err) {
    console.error("❌ Meta API getTemplates error:", err.response?.data || err.message);
    throw new Error(err.response?.data?.error?.message || err.message);
  }
};
const createTemplate = async (name, language, category, text, headerType = "NONE", headerText = "", footerText = "", buttons = []) => {
  try {
    const components = [
      {
        type: "BODY",
        text: text,
      }
    ];

    if (headerType && headerType !== "NONE") {
      if (headerType === "TEXT" && !headerText) {
        // Skip header if it's TEXT but the text is empty
      } else {
        const headerComp = {
          type: "HEADER",
          format: headerType,
        };
        if (headerType === "TEXT") {
          headerComp.text = headerText;
        } else if (headerType === "IMAGE" || headerType === "VIDEO" || headerType === "DOCUMENT") {
          // Meta requires an example object for media headers
          headerComp.example = {
            header_handle: ["4:YXNpY..."] // Dummy handle, Meta sometimes accepts dummy for creation
          };
        }
        components.unshift(headerComp);
      }
    }

    if (footerText) {
      components.push({
        type: "FOOTER",
        text: footerText,
      });
    }

    if (buttons && buttons.length > 0) {
      const buttonComponent = {
        type: "BUTTONS",
        buttons: buttons.map(btn => {
          if (btn.type === "QUICK_REPLY") {
            return { type: "QUICK_REPLY", text: btn.text };
          } else if (btn.type === "URL") {
            return { type: "URL", text: btn.text, url: btn.url };
          } else if (btn.type === "PHONE_NUMBER") {
            return { type: "PHONE_NUMBER", text: btn.text, phone_number: btn.phone_number };
          }
          return null;
        }).filter(Boolean),
      };
      components.push(buttonComponent);
    }

    const payload = {
      name: name.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
      language,
      category,
      components: components,
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

const getAccountHealth = async () => {
  try {
    const response = await axios.get(
      `${META_API_BASE}/${PHONE_NUMBER_ID}?fields=display_phone_number,name_status,quality_rating,messaging_limit_tier,status`,
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
        },
      }
    );
    return { success: true, data: response.data };
  } catch (err) {
    console.error("❌ Meta API getAccountHealth error:", err.response?.data || err.message);
    return { success: false, error: err.response?.data?.error?.message || err.message };
  }
};

module.exports = { 
  sendTemplateMessage, 
  sendTextMessage, 
  uploadMediaToMeta, 
  downloadMediaFromMeta, 
  getTemplates, 
  createTemplate,
  sendMediaMessage,
  getAccountHealth,
};
