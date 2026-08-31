require('dotenv').config();
const { sendTemplateMessage, getTemplates } = require('./services/metaApi');

(async () => {
    try {
        console.log("Sending template...");
        const to = "919256752664";
        const templateName = "gau_seva_camp_01";
        const languageCode = "en"; // Trying en
        const components = [
            {
                type: "body",
                parameters: [
                    { type: "text", text: "Mox rathore" },
                    { type: "text", text: "Special Fodder Distribution" }
                ]
            }
        ];
        const response = await sendTemplateMessage(to, templateName, languageCode, components);
        console.log("Response:", response);
    } catch (e) {
        console.error(e);
    }
})();
