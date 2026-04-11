/**
 * Lightweight web dashboard — no external dependencies, pure Node http.
 * Provides: config viewer, briefing history, manual trigger, template management.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");
const templateLoader = require("./template-loader");

let scheduler = null;
let serverInstance = null;

function setScheduler(s) { scheduler = s; }

function start(port) {
  const p = port || parseInt(process.env.WEB_PORT) || 3000;

  serverInstance = http.createServer(async (req, res) => {
    const parsed = url.parse(req.url, true);
    const pathname = parsed.pathname;

    // CORS — restrict to local origins (plus optional WEB_ALLOW_ORIGIN)
    const origin = req.headers.origin || "";
    const allowedOrigin = process.env.WEB_ALLOW_ORIGIN || "";
    const localOrigin = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin);
    if (localOrigin || (allowedOrigin && origin === allowedOrigin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    }
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

    try {
      // ── API Routes ──
      if (pathname === "/api/status") return json(res, getStatus());
      if (pathname === "/api/templates") return json(res, getTemplates());
      if (pathname === "/api/history") return json(res, getHistory(parsed.query));
      if (pathname === "/api/trigger" && req.method === "POST") return await handleTrigger(req, res);

      // ── Static: serve dashboard ──
      if (pathname === "/" || pathname === "/index.html") {
        return serve(res, path.join(__dirname, "..", "web", "index.html"), "text/html");
      }
      if (pathname === "/land.json") {
        return serve(res, path.join(__dirname, "..", "web", "land.json"), "application/json");
      }

      res.writeHead(404); res.end("Not found");
    } catch (err) {
      console.error(`[web] ${req.method} ${pathname} error:`, err.message);
      res.writeHead(500); res.end(JSON.stringify({ error: err.message }));
    }
  });

  serverInstance.listen(p, () => {
    console.log(`[web] Dashboard running at http://localhost:${p}`);
  });
}

function json(res, data) {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function serve(res, filePath, contentType) {
  if (!fs.existsSync(filePath)) { res.writeHead(404); res.end("Not found"); return; }
  res.writeHead(200, { "Content-Type": contentType });
  res.end(fs.readFileSync(filePath, "utf-8"));
}

function getStatus() {
  return {
    version: require("../package.json").version,
    uptime: process.uptime(),
    templates: (process.env.TEMPLATES || "crypto,ai-tech").split(",").map(s => s.trim()),
    schedule: process.env.CRON_SCHEDULE || "0 8,12,18,22 * * *",
    aiProvider: process.env.AI_PROVIDER || "claude",
    language: process.env.LANGUAGE || "zh",
  };
}

function getTemplates() {
  const names = templateLoader.listAll();
  return names.map((n) => {
    try {
      const t = templateLoader.load(n);
      return { name: n, displayName: t.name, description: t.description, feedCount: (t.feeds || []).length, keywords: t.keywords || [] };
    } catch { return { name: n, error: true }; }
  });
}

function getHistory(query) {
  const histDir = path.join(__dirname, "..", "data");
  const files = fs.readdirSync(histDir).filter(f => f.startsWith("briefing-") && f.endsWith(".html")).sort().reverse();
  const limit = parseInt(query?.limit) || 20;
  return files.slice(0, limit).map((f) => {
    const content = fs.readFileSync(path.join(histDir, f), "utf-8");
    const match = f.match(/briefing-(.+)-(\d{4}-\d{2}-\d{2}T[\d-]+)\.html/);
    return {
      file: f,
      template: match?.[1] || "unknown",
      date: match?.[2]?.replace(/-/g, (m, i) => i > 9 ? ":" : m) || "",
      preview: content.slice(0, 300),
      size: content.length,
    };
  });
}

// Whitelist of safe template name characters — prevents path traversal
const SAFE_NAME = /^[a-z0-9_-]{1,64}$/i;

async function handleTrigger(req, res) {
  if (!scheduler) { json(res, { error: "Scheduler not initialized" }); return; }
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    try {
      const { template } = body ? JSON.parse(body) : {};
      if (template) {
        // Sanitize: strip directory components and validate format
        const safeName = path.basename(String(template));
        if (!SAFE_NAME.test(safeName)) {
          json(res, { error: "Invalid template name" });
          return;
        }
        // Verify it exists in the known template list
        const allowed = templateLoader.listAll();
        if (!allowed.includes(safeName)) {
          json(res, { error: "Unknown template" });
          return;
        }
        json(res, { status: "triggered", template: safeName });
        const tpl = templateLoader.load(safeName);
        tpl._name = safeName;
        scheduler.runOnce(tpl).catch(console.error);
      } else {
        json(res, { status: "triggered", template: "all" });
        scheduler.runAll().catch(console.error);
      }
    } catch (err) { json(res, { error: err.message }); }
  });
}

function stop() { if (serverInstance) serverInstance.close(); }

module.exports = { start, stop, setScheduler };
