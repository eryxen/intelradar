/**
 * AI Summarizer — generates a formatted intelligence briefing from filtered articles.
 * Optionally correlates with prediction market data.
 */
const { ask } = require("./index");

const SYSTEM_PROMPT_ZH = `你是一个专业的情报分析师。根据提供的新闻摘要，生成一份简洁的每日情报简报。

格式要求:
- 用 HTML 格式 (Telegram 兼容)
- 每条新闻: <b>标题</b> + 1-2 句核心摘要 + 来源链接
- 如果有关联的预测市场数据，在新闻后附带赔率
- 开头写一句整体趋势总结
- 结尾附上简报生成时间
- 简洁有力，不要废话`;

const SYSTEM_PROMPT_EN = `You are a professional intelligence analyst. Generate a concise daily intelligence briefing from the provided news summaries.

Format:
- HTML format (Telegram compatible)
- Each item: <b>Title</b> + 1-2 sentence core summary + source link
- If prediction market data correlates, append odds after the news item
- Start with one-sentence trend overview
- End with briefing timestamp
- Concise and actionable, no filler`;

/**
 * Generate an intelligence briefing.
 * @param {Array<Article>} articles - Filtered articles
 * @param {Array<Market>} markets - Polymarket data (optional)
 * @param {Object} opts
 * @returns {Promise<string>} HTML-formatted briefing
 */
async function summarize(articles, markets = [], opts = {}) {
  if (!articles.length) return "";

  const lang = opts.language || process.env.LANGUAGE || "zh";
  const model = process.env.AI_MODEL_SUMMARY || "claude-sonnet-4-6";
  const systemPrompt = lang === "en" ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT_ZH;

  const newsBlock = articles.slice(0, 15).map((a) =>
    `- [${a.relevanceScore || "?"}] ${a.title}\n  ${a.summary?.slice(0, 150)}\n  Source: ${a.source} | ${a.url}`
  ).join("\n\n");

  let marketBlock = "";
  if (markets.length) {
    marketBlock = "\n\nPrediction Markets (for correlation):\n" +
      markets.slice(0, 20).map((m) => {
        const prices = m.markets?.[0];
        const odds = prices?.outcomes?.map((o, i) =>
          `${o}: ${Math.round((prices.outcomePrices?.[i] || 0) * 100)}%`
        ).join(" / ") || "";
        return `- ${m.title} ${odds ? `(${odds})` : ""} ${m.url}`;
      }).join("\n");
  }

  const userPrompt = `Generate a ${lang === "en" ? "English" : "Chinese"} intelligence briefing.
Domain: ${opts.templateName || "General"}
Date: ${new Date().toISOString().split("T")[0]}

News articles (sorted by relevance):
${newsBlock}
${marketBlock}

Generate the HTML briefing now.`;

  try {
    return await ask(model, systemPrompt, userPrompt);
  } catch (err) {
    console.error(`[ai:summarize] error: ${err.message}`);
    // Fallback: simple list
    return articles.slice(0, 10).map((a) =>
      `<b>${a.title}</b>\n${a.summary?.slice(0, 100)}\n<a href="${a.url}">Source</a>`
    ).join("\n\n");
  }
}

module.exports = { summarize };
