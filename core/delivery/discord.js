/**
 * Discord delivery — sends briefings via webhook.
 */
const https = require("https");

async function send(content, webhookUrl) {
  const url = webhookUrl || process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;

  // Convert HTML to basic markdown for Discord
  const md = content
    .replace(/<b>(.*?)<\/b>/g, "**$1**")
    .replace(/<i>(.*?)<\/i>/g, "*$1*")
    .replace(/<a href="(.*?)">(.*?)<\/a>/g, "[$2]($1)")
    .replace(/<[^>]+>/g, "");

  const chunks = md.length > 1900 ? [md.slice(0, 1900) + "..."] : [md];

  for (const chunk of chunks) {
    await postWebhook(url, { content: chunk });
  }
}

function postWebhook(url, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const data = JSON.stringify(body);
    const req = https.request(parsed, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) },
    }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => resolve(d));
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

module.exports = { send };
