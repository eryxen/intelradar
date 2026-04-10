/**
 * Deduplication layer — sql.js (pure JS SQLite) backed article fingerprinting.
 * Prevents sending the same story twice across runs.
 */
const initSqlJs = require("sql.js");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

let db = null;
let dbPath = null;

async function init(customPath) {
  if (db) return db;
  dbPath = customPath || path.join(__dirname, "..", "data", "intelradar.db");

  const SQL = await initSqlJs();

  if (fs.existsSync(dbPath)) {
    const buf = fs.readFileSync(dbPath);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }

  db.run(`CREATE TABLE IF NOT EXISTS seen_articles (
    hash TEXT PRIMARY KEY,
    title TEXT,
    url TEXT,
    first_seen TEXT DEFAULT (datetime('now')),
    template TEXT
  )`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_seen_first ON seen_articles(first_seen)`);
  save();
  return db;
}

function save() {
  if (!db || !dbPath) return;
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

function fingerprint(article) {
  const norm = (article.title || "").toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, "");
  return crypto.createHash("md5").update(norm).digest("hex");
}

/**
 * Filter out already-seen articles. Returns only new ones.
 */
async function filterNew(articles, template = "default", windowHours = 48) {
  await init();

  db.run(`DELETE FROM seen_articles WHERE first_seen < datetime('now', '-${windowHours} hours')`);

  const newArticles = [];
  for (const a of articles) {
    const hash = fingerprint(a);
    const exists = db.exec(`SELECT 1 FROM seen_articles WHERE hash = '${hash}'`);
    if (!exists.length || !exists[0].values.length) {
      db.run("INSERT OR IGNORE INTO seen_articles (hash, title, url, template) VALUES (?, ?, ?, ?)",
        [hash, a.title, a.url, template]);
      newArticles.push(a);
    }
  }
  save();
  return newArticles;
}

function close() {
  if (db) { save(); db.close(); db = null; }
}

module.exports = { filterNew, close };
