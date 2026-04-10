/**
 * Polymarket Collector — fetches active prediction markets for correlation with news.
 * Uses the free Gamma API (no auth required).
 */
const https = require("https");

const GAMMA_API = "https://gamma-api.polymarket.com";

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "IntelRadar/0.1" } }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse error: ${e.message}`)); }
      });
      res.on("error", reject);
    }).on("error", reject);
  });
}

/**
 * Fetch active prediction markets.
 * @param {Object} opts
 * @param {number} opts.limit - Max markets to fetch (default 50)
 * @param {string} opts.tag - Optional tag filter (e.g. "crypto", "politics")
 * @returns {Promise<Array<Market>>}
 */
async function collect({ limit = 50, tag } = {}) {
  try {
    let url = `${GAMMA_API}/events?closed=false&limit=${limit}&order=volume24hr&ascending=false`;
    if (tag) url += `&tag=${encodeURIComponent(tag)}`;

    const events = await fetchJSON(url);
    if (!Array.isArray(events)) return [];

    return events.map((ev) => ({
      id: ev.id || ev.slug,
      title: ev.title || "",
      description: (ev.description || "").slice(0, 300),
      url: `https://polymarket.com/event/${ev.slug || ev.id}`,
      endDate: ev.endDate,
      volume24h: ev.volume24hr || 0,
      markets: (ev.markets || []).map((m) => ({
        question: m.question || m.groupItemTitle || "",
        outcomePrices: m.outcomePrices ? JSON.parse(m.outcomePrices) : [],
        outcomes: m.outcomes ? JSON.parse(m.outcomes) : [],
        volume24h: m.volume24hr || 0,
      })),
      collector: "polymarket",
    }));
  } catch (err) {
    console.error(`[polymarket] fetch error: ${err.message}`);
    return [];
  }
}

module.exports = { collect };
