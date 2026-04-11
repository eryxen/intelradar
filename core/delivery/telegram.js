/**
 * Telegram delivery — sends briefings to a TG channel/group.
 */
const TelegramBot = require("node-telegram-bot-api");

let bot = null;

/**
 * Escape HTML special characters to prevent injection from RSS content.
 * Telegram's HTML parse mode supports a subset of tags — user-generated
 * text must be escaped to prevent tag injection (e.g. malicious <a href>).
 */
function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function init() {
  const token = process.env.TG_BOT_TOKEN;
  if (!token) throw new Error("TG_BOT_TOKEN not set");
  if (!bot) bot = new TelegramBot(token, { polling: false });
  return bot;
}

/**
 * Send a briefing to the configured channel.
 * Splits long messages to stay within Telegram's 4096 char limit.
 * @param {string} html - HTML-formatted briefing
 * @param {string} chatId - Override channel ID
 */
async function send(html, chatId) {
  const b = init();
  const target = chatId || process.env.TG_CHANNEL_ID;
  if (!target) throw new Error("TG_CHANNEL_ID not set");

  const chunks = splitMessage(html, 4000);
  for (const chunk of chunks) {
    await b.sendMessage(target, chunk, {
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
    // Respect TG rate limits: 20 msg/min to groups
    if (chunks.length > 1) await sleep(3000);
  }
}

/**
 * Notify the owner about errors or important events.
 */
async function notifyOwner(text) {
  const ownerId = process.env.TG_OWNER_ID;
  if (!ownerId) return;
  try {
    const b = init();
    await b.sendMessage(ownerId, text, { parse_mode: "HTML" });
  } catch (err) {
    console.error(`[tg] notify owner failed: ${err.message}`);
  }
}

function splitMessage(text, maxLen) {
  if (text.length <= maxLen) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    // Try to split at a newline
    let splitIdx = remaining.lastIndexOf("\n", maxLen);
    if (splitIdx < maxLen * 0.5) splitIdx = maxLen;
    chunks.push(remaining.slice(0, splitIdx));
    remaining = remaining.slice(splitIdx);
  }
  return chunks;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { send, notifyOwner, escapeHtml };
