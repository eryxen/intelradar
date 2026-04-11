/**
 * Breaking News Monitor — continuous scan for high-importance breaking news.
 *
 * Runs every N minutes (default 30) on a separate cron from the main briefing.
 * Scores articles for "breaking importance" (1-10) and pushes 8+ immediately
 * as individual alerts. Articles scoring 6-7 are queued for the next briefing.
 */
const cron = require("node-cron");
const rssCollector = require("./collectors/rss");
const polyCollector = require("./collectors/polymarket");
const { ask } = require("./ai/index");
const dedup = require("./dedup");
const templateLoader = require("./template-loader");
const tg = require("./delivery/telegram");
const { escapeHtml } = require("./delivery/telegram");
const fs = require("fs");
const path = require("path");

// In-memory rate limiter: timestamps of sent breaking alerts
const sentTimestamps = [];

// Queued highlights for next regular briefing
const highlightQueue = [];

/**
 * Get the timezone context string based on current UTC hour.
 */
function getTimezoneContext() {
  const utcHour = new Date().getUTCHours();
  const contexts = [];

  // US Eastern (UTC-4/-5)
  const usEastern = (utcHour - 4 + 24) % 24;
  if (usEastern >= 9 && usEastern <= 16) contexts.push("US market hours");
  else if (usEastern >= 6 && usEastern < 9) contexts.push("US pre-market");

  // Asia (UTC+8)
  const asia = (utcHour + 8) % 24;
  if (asia >= 9 && asia <= 15) contexts.push("Asia market hours");
  else if (asia >= 6 && asia < 9) contexts.push("Asia morning");
  else if (asia >= 20 || asia < 6) contexts.push("Asia night");

  // Europe (UTC+1/+2)
  const europe = (utcHour + 1) % 24;
  if (europe >= 8 && europe <= 17) contexts.push("Europe market hours");
  else if (europe >= 6 && europe < 8) contexts.push("Europe morning");

  return contexts.length ? contexts.join(" / ") : "off-hours globally";
}

/**
 * Check rate limit: max N alerts per rolling hour.
 * @returns {boolean} true if we can send
 */
function canSendAlert() {
  const maxPerHour = parseInt(process.env.BREAKING_MAX_PER_HOUR) || 5;
  const oneHourAgo = Date.now() - 60 * 60 * 1000;

  // Prune old timestamps
  while (sentTimestamps.length && sentTimestamps[0] < oneHourAgo) {
    sentTimestamps.shift();
  }

  return sentTimestamps.length < maxPerHour;
}

/**
 * Record that we sent an alert now.
 */
function recordSent() {
  sentTimestamps.push(Date.now());
}

/**
 * Format a relative time string.
 */
function timeAgo(isoDate) {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Format a breaking alert for Telegram (HTML).
 */
function formatBreakingAlert(article, tzContext) {
  // Escape all untrusted RSS-sourced strings to prevent HTML injection
  const category = escapeHtml(article.breakingCategory || "World");
  const headline = escapeHtml(article.breakingHeadline || article.title);
  const summary = escapeHtml(article.breakingSummary || article.summary?.slice(0, 200) || "");
  const source = escapeHtml(article.source);

  let msg = `\u{1F6A8} <b>BREAKING | ${category}</b>\n\n`;
  msg += `<b>${headline}</b>\n\n`;
  msg += `${summary}\n\n`;
  msg += `Source: ${source} | ${timeAgo(article.publishedAt)}`;

  if (tzContext) {
    msg += `\n\u{1F30F} ${escapeHtml(tzContext)}`;
  }

  if (article.polymarketEvent) {
    // URL goes inside href="" — escape but also sanity-check it's http(s)
    const url = /^https?:\/\//.test(article.polymarketEvent.url) ? article.polymarketEvent.url : "#";
    msg += `\n\u{1F52E} Related: <a href="${escapeHtml(url)}">${escapeHtml(article.polymarketEvent.title)}</a>`;
  }

  return msg;
}

const BREAKING_SYSTEM_PROMPT = `You are a breaking news importance evaluator. Score each article for "breaking importance" on a 1-10 scale.

Scoring criteria:
- Global impact: How many countries/people does this affect?
- Urgency: Does the public need to know RIGHT NOW?
- Market-moving potential: Could this move financial/crypto markets significantly?
- Geopolitical significance: Major power dynamics, conflicts, leadership changes?
- Novelty: Is this genuinely new information, not rehashed analysis?

Score guide:
- 9-10: Historic events (war outbreak, major leader death/resignation, financial crash, pandemic declaration)
- 8: Major breaking (significant policy shift, large-scale disaster, unexpected election result, major hack/breach)
- 6-7: Important but not urgent (new regulation announced, notable appointment, significant protest)
- 4-5: Standard news cycle (routine meetings, minor updates, analysis pieces)
- 1-3: Not breaking (opinion, feature stories, old news rehashed)

Return ONLY valid JSON array. For each article include:
- idx: article index
- score: 1-10
- category: one of [Geopolitics, Markets, Conflict, Disaster, Policy, Tech, Health, Climate, Crime]
- headline_zh: headline translated to Chinese (concise, < 50 chars)
- summary_zh: 2-sentence summary in Chinese explaining why this matters`;

/**
 * Run one breaking news scan cycle.
 */
async function scan() {
  const enabled = process.env.BREAKING_ENABLED !== "false";
  if (!enabled) return;

  console.log(`[${ts()}] [breaking] starting scan...`);

  // 1. Load breaking template
  let template;
  try {
    template = templateLoader.load("breaking");
  } catch (err) {
    console.error(`[${ts()}] [breaking] template not found: ${err.message}`);
    return;
  }

  // 2. Collect RSS (shorter window — only last 2 hours for breaking)
  const rawArticles = await rssCollector.collect(template.feeds || [], 2);
  console.log(`[${ts()}] [breaking] collected ${rawArticles.length} raw articles`);

  // 3. Dedup (use "breaking" namespace)
  const newArticles = await dedup.filterNew(rawArticles, "breaking", 24);
  console.log(`[${ts()}] [breaking] ${newArticles.length} new (${rawArticles.length - newArticles.length} deduped)`);

  if (!newArticles.length) {
    console.log(`[${ts()}] [breaking] no new articles, done`);
    return;
  }

  // 4. AI scoring for breaking importance
  const threshold = parseInt(process.env.BREAKING_THRESHOLD) || 8;
  const model = process.env.AI_MODEL_FILTER || "claude-haiku-4-5";
  // Cap at 30 articles per cycle — anything beyond is too old to be "breaking"
  const articlesToScore = newArticles.slice(0, 30);
  const batch = articlesToScore.map((a, i) => ({
    idx: i,
    title: a.title,
    summary: a.summary?.slice(0, 200),
    source: a.source,
    publishedAt: a.publishedAt,
  }));

  const userPrompt = `Evaluate these articles for breaking news importance:

${JSON.stringify(batch, null, 0)}

Return JSON array: [{"idx": 0, "score": 8, "category": "Markets", "headline_zh": "...", "summary_zh": "..."}, ...]`;

  let scored = [];
  try {
    const raw = await ask(model, BREAKING_SYSTEM_PROMPT, userPrompt);
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) {
      console.error(`[${ts()}] [breaking] AI returned no valid JSON`);
      return;
    }
    scored = JSON.parse(match[0]);
  } catch (err) {
    console.error(`[${ts()}] [breaking] AI scoring error: ${err.message}`);
    return;
  }

  // 5. Build score map
  const scoreMap = new Map(scored.map((s) => [s.idx, s]));
  const tzContext = getTimezoneContext();

  let alertsSent = 0;
  let highlighted = 0;

  for (let i = 0; i < articlesToScore.length; i++) {
    const info = scoreMap.get(i);
    if (!info) continue;

    const article = {
      ...articlesToScore[i],
      breakingScore: info.score,
      breakingCategory: info.category,
      breakingHeadline: info.headline_zh,
      breakingSummary: info.summary_zh,
    };

    if (info.score >= threshold) {
      // Immediate push
      if (!canSendAlert()) {
        console.log(`[${ts()}] [breaking] rate limited, skipping alert for: ${article.title}`);
        highlightQueue.push(article);
        highlighted++;
        continue;
      }

      // Try to match a Polymarket event
      try {
        const keywords = article.title.split(/\s+/).slice(0, 3).join(" ");
        const markets = await polyCollector.collect({ limit: 5, tag: keywords });
        if (markets.length) {
          article.polymarketEvent = { title: markets[0].title, url: markets[0].url };
        }
      } catch (_) { /* optional, don't block on failure */ }

      const alertMsg = formatBreakingAlert(article, tzContext);

      if (process.env.TG_BOT_TOKEN && process.env.TG_CHANNEL_ID) {
        try {
          await tg.send(alertMsg);
          recordSent();
          alertsSent++;
          console.log(`[${ts()}] [breaking] ALERT sent: ${article.title} (score=${info.score})`);
        } catch (err) {
          console.error(`[${ts()}] [breaking] TG send error: ${err.message}`);
        }
      }
    } else if (info.score >= 6) {
      // Queue for next regular briefing
      highlightQueue.push(article);
      highlighted++;
    }
  }

  // Save highlight queue to file for regular briefing to pick up
  if (highlightQueue.length) {
    const queueFile = path.join(__dirname, "..", "data", "breaking-highlights.json");
    try {
      fs.writeFileSync(queueFile, JSON.stringify(highlightQueue, null, 2), "utf-8");
    } catch (err) {
      console.error(`[${ts()}] [breaking] failed to save highlight queue: ${err.message}`);
    }
  }

  console.log(`[${ts()}] [breaking] scan complete: ${alertsSent} alerts sent, ${highlighted} queued as highlights`);
}

/**
 * Read and flush the highlight queue (called by regular briefing).
 * @returns {Array} Queued highlight articles
 */
function flushHighlights() {
  const queueFile = path.join(__dirname, "..", "data", "breaking-highlights.json");
  let items = [];
  try {
    if (fs.existsSync(queueFile)) {
      items = JSON.parse(fs.readFileSync(queueFile, "utf-8"));
      fs.unlinkSync(queueFile);
    }
  } catch (err) {
    console.error(`[breaking] failed to read highlight queue: ${err.message}`);
  }
  // Also flush in-memory queue
  const mem = highlightQueue.splice(0, highlightQueue.length);
  // Merge and deduplicate by title
  const seen = new Set();
  const merged = [];
  for (const a of [...items, ...mem]) {
    if (!seen.has(a.title)) {
      seen.add(a.title);
      merged.push(a);
    }
  }
  return merged;
}

/**
 * Start the breaking news cron.
 */
function start() {
  const enabled = process.env.BREAKING_ENABLED !== "false";
  if (!enabled) {
    console.log(`[${ts()}] [breaking] disabled (BREAKING_ENABLED=false)`);
    return;
  }

  const schedule = process.env.BREAKING_CRON || "*/30 * * * *";
  const tz = process.env.TIMEZONE || "Asia/Kuala_Lumpur";
  const threshold = parseInt(process.env.BREAKING_THRESHOLD) || 8;
  const maxPerHour = parseInt(process.env.BREAKING_MAX_PER_HOUR) || 5;

  console.log(`[${ts()}] [breaking] monitor started`);
  console.log(`[${ts()}] [breaking] schedule: ${schedule} (${tz})`);
  console.log(`[${ts()}] [breaking] threshold: ${threshold}+, max ${maxPerHour}/hour`);

  cron.schedule(schedule, () => scan().catch((err) => {
    console.error(`[${ts()}] [breaking] scan error: ${err.message}`);
    tg.notifyOwner(`\u{274C} IntelRadar breaking scan error: ${err.message}`).catch(() => {});
  }), { timezone: tz });
}

function ts() {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

module.exports = { start, scan, flushHighlights };
