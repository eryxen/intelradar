/**
 * Generic webhook delivery — POST briefing to any URL.
 */
const https = require("https");
const http = require("http");

async function send(content, webhookUrl, meta = {}) {
  const url = webhookUrl || process.env.WEBHOOK_URL;
  if (!url) return;

  const body = JSON.stringify({
    briefing: content,
    timestamp: new Date().toISOString(),
    ...meta,
  });

  const parsed = new URL(url);
  const transport = parsed.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const req = transport.request(parsed, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => resolve(d));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

module.exports = { send };
