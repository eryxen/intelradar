/**
 * Scheduler — orchestrates the collect → filter → summarize → deliver pipeline.
 */
const cron = require("node-cron");
const rssCollector = require("./collectors/rss");
const polyCollector = require("./collectors/polymarket");
const { filter } = require("./ai/filter");
const { summarize } = require("./ai/summarize");
const dedup = require("./dedup");
const templateLoader = require("./template-loader");
const tg = require("./delivery/telegram");
const discord = require("./delivery/discord");
const webhook = require("./delivery/webhook");
const fs = require("fs");
const path = require("path");

/**
 * Run one briefing cycle for a given template.
 */
async function runOnce(template) {
  const name = template._name || template.name;
  console.log(`[${ts()}] [${name}] starting collection...`);

  // 1. Collect RSS
  const rawArticles = await rssCollector.collect(template.feeds || [], 24);
  console.log(`[${ts()}] [${name}] collected ${rawArticles.length} raw articles`);

  // 2. Dedup
  const newArticles = await dedup.filterNew(rawArticles, name);
  console.log(`[${ts()}] [${name}] ${newArticles.length} new (${rawArticles.length - newArticles.length} deduped)`);

  if (!newArticles.length) {
    console.log(`[${ts()}] [${name}] no new articles, skipping`);
    return null;
  }

  // 3. AI filter
  const maxArticles = parseInt(process.env.MAX_ARTICLES_PER_RUN) || 50;
  const filtered = await filter(newArticles.slice(0, maxArticles), template);
  console.log(`[${ts()}] [${name}] ${filtered.length} passed AI filter`);

  if (!filtered.length) {
    console.log(`[${ts()}] [${name}] nothing passed filter, skipping`);
    return null;
  }

  // 4. Fetch prediction markets (if enabled)
  let markets = [];
  if (template.polymarket?.tags?.length) {
    for (const tag of template.polymarket.tags) {
      const m = await polyCollector.collect({ limit: 15, tag });
      markets.push(...m);
    }
    console.log(`[${ts()}] [${name}] fetched ${markets.length} prediction markets`);
  }

  // 5. Generate briefing
  const briefing = await summarize(filtered, markets, {
    language: template.language || process.env.LANGUAGE || "zh",
    templateName: template.name,
  });

  // 6. Deliver
  const header = `📡 <b>IntelRadar | ${template.name}</b>\n\n`;
  const fullBriefing = header + briefing;

  if (process.env.TG_BOT_TOKEN && process.env.TG_CHANNEL_ID) {
    await tg.send(fullBriefing);
    console.log(`[${ts()}] [${name}] sent to Telegram`);
  }

  if (process.env.DISCORD_WEBHOOK_URL) {
    await discord.send(fullBriefing, process.env.DISCORD_WEBHOOK_URL);
    console.log(`[${ts()}] [${name}] sent to Discord`);
  }

  if (process.env.WEBHOOK_URL) {
    await webhook.send(fullBriefing, process.env.WEBHOOK_URL, { template: name });
  }

  // Save to file for web dashboard history
  const histFile = path.join(__dirname, "..", "data",
    `briefing-${name}-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.html`);
  fs.writeFileSync(histFile, fullBriefing, "utf-8");

  return fullBriefing;
}

/**
 * Run all configured templates.
 */
async function runAll() {
  const names = (process.env.TEMPLATES || "crypto,ai-tech").split(",").map((s) => s.trim());
  const templates = templateLoader.loadMany(names);

  console.log(`[${ts()}] === Running ${templates.length} templates: ${names.join(", ")} ===`);

  for (const tpl of templates) {
    try {
      await runOnce(tpl);
    } catch (err) {
      console.error(`[${ts()}] [${tpl._name}] error: ${err.message}`);
      tg.notifyOwner(`❌ IntelRadar error [${tpl._name}]: ${err.message}`).catch(() => {});
    }
    // Small delay between templates to avoid rate limits
    if (templates.length > 1) await new Promise((r) => setTimeout(r, 5000));
  }

  console.log(`[${ts()}] === Cycle complete ===\n`);
}

/**
 * Start the cron scheduler.
 */
function start() {
  const schedule = process.env.CRON_SCHEDULE || "0 8,12,18,22 * * *";
  const tz = process.env.TIMEZONE || "Asia/Kuala_Lumpur";

  console.log(`[${ts()}] IntelRadar scheduler started`);
  console.log(`[${ts()}] Schedule: ${schedule} (${tz})`);
  console.log(`[${ts()}] Templates: ${process.env.TEMPLATES || "crypto,ai-tech"}`);

  cron.schedule(schedule, () => runAll(), { timezone: tz });
}

function ts() {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

module.exports = { start, runAll, runOnce };
