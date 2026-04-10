/**
 * RSS Collector — fetches articles from RSS/Atom feeds defined in templates.
 * Returns standardized article objects for the AI pipeline.
 */
const Parser = require("rss-parser");

const parser = new Parser({
  timeout: 15000,
  headers: { "User-Agent": "IntelRadar/0.1 (+https://github.com/xen/intelradar)" },
});

/**
 * Fetch articles from a list of RSS feed URLs.
 * @param {Array<{url: string, name?: string}>} feeds
 * @param {number} maxAge - Max article age in hours (default 24)
 * @returns {Promise<Array<Article>>}
 */
async function collect(feeds, maxAge = 24) {
  const cutoff = Date.now() - maxAge * 60 * 60 * 1000;
  const results = [];

  const tasks = feeds.map(async (feed) => {
    try {
      const data = await parser.parseURL(feed.url);
      for (const item of data.items || []) {
        const pubDate = item.pubDate ? new Date(item.pubDate).getTime() : Date.now();
        if (pubDate < cutoff) continue;

        results.push({
          id: item.guid || item.link || `${feed.url}#${item.title}`,
          title: (item.title || "").trim(),
          summary: (item.contentSnippet || item.content || "").slice(0, 500).trim(),
          url: item.link || "",
          source: feed.name || data.title || new URL(feed.url).hostname,
          publishedAt: new Date(pubDate).toISOString(),
          collector: "rss",
        });
      }
    } catch (err) {
      console.error(`[rss] failed to fetch ${feed.url}: ${err.message}`);
    }
  });

  await Promise.allSettled(tasks);

  // Sort newest first
  results.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  return results;
}

module.exports = { collect };
