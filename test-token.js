const { sendTemplateMessage } = require("./services/metaApi");
require("dotenv").config();
(async () => {
  const result = await sendTemplateMessage("919256752664", "hello_world", "en_US");
  console.log(result);
})();
