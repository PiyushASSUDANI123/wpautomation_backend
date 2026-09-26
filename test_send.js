require('dotenv').config();
const { getTemplates, sendTemplateMessage } = require('./services/metaApi');

async function main() {
  const templates = await getTemplates();
  console.log("Found templates:", templates.map(t => t.name));
  
  if (templates.length > 0) {
    const templateName = templates[0].name;
    const languageCode = templates[0].language;
    console.log(`Sending template: ${templateName} (${languageCode}) to 919413879444`);
    const res = await sendTemplateMessage("919413879444", templateName, languageCode);
    console.log("Response:", res);
  } else {
    console.log("No templates found.");
  }
}

main();
