/**
 * AI Filter — uses a fast/cheap model to score article relevance.
 * Returns only articles that pass the relevance threshold.
 */
const { ask } = require("./index");

const SYSTEM_PROMPT = `You are a news relevance filter. Given a batch of article titles and summaries, score each 1-10 for relevance to the specified domain/keywords. Return ONLY valid JSON array.

Rules:
- Score 7+ = highly relevant, include
- Score 4-6 = marginal, include only if few high-quality articles
- Score 1-3 = irrelevant, exclude
- Duplicates or near-duplicates: keep only the best source, mark others as 0
- Clickbait or low-quality: score 0 regardless of topic`;

/**
 * Filter articles by relevance to a domain.
 * @param {Array<Article>} articles
 * @param {Object} template - Domain template with keywords and description
 * @returns {Promise<Array<Article>>} Filtered articles with scores
 */
async function filter(articles, template) {
  if (!articles.length) return [];

  const model = process.env.AI_MODEL_FILTER || "claude-haiku-4-5";
  const batch = articles.slice(0, 30).map((a, i) => ({
    idx: i,
    title: a.title,
    summary: a.summary?.slice(0, 200),
    source: a.source,
  }));

  const userPrompt = `Domain: ${template.name}
Description: ${template.description}
Keywords: ${(template.keywords || []).join(", ")}

Articles:
${JSON.stringify(batch, null, 0)}

Return JSON array of objects: [{"idx": 0, "score": 8, "reason": "..."}, ...]`;

  try {
    const raw = await ask(model, SYSTEM_PROMPT, userPrompt);
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return articles.slice(0, 10); // fallback: return first 10

    const scores = JSON.parse(match[0]);
    const scoreMap = new Map(scores.map((s) => [s.idx, s]));

    return articles
      .map((a, i) => {
        const s = scoreMap.get(i);
        return { ...a, relevanceScore: s?.score || 0, filterReason: s?.reason || "" };
      })
      .filter((a) => a.relevanceScore >= 5)
      .sort((a, b) => b.relevanceScore - a.relevanceScore);
  } catch (err) {
    console.error(`[ai:filter] error: ${err.message}`);
    return articles.slice(0, 10); // fallback
  }
}

module.exports = { filter };
