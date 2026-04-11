/**
 * Deduplication layer — sql.js (pure JS SQLite) backed article fingerprinting.
 * Prevents sending the same story twice across runs.
 *
 * Uses a single init Promise to guard against concurrent initialization,
 * and a write queue to serialize save() calls across overlapping callers.
 */
const initSqlJs = require("sql.js");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

let db = null;
let dbPath = null;
let initPromise = null;
let writeLock = Promise.resolve();

function init(customPath) {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    dbPath = customPath || path.join(__dirname, "..", "data", "intelradar.db");
    const SQL = await initSqlJs();
    if (fs.existsSync(dbPath)) {
      db = new SQL.Database(fs.readFileSync(dbPath));
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
    await save();
    return db;
  })();
  return initPromise;
}

function save() {
  // Serialize writes to avoid corruption from overlapping calls
  writeLock = writeLock.then(() => {
    if (!db || !dbPath) return;
    const data = db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
  }).catch((e) => {
    console.error(`[dedup] save error: ${e.message}`);
  });
  return writeLock;
}

function fingerprint(article) {
  const norm = (article.title || "").toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, "");
  return crypto.createHash("md5").update(norm).digest("hex");
}

/**
 * Check if a hash exists using a parameterized prepared statement.
 */
function hashExists(hash) {
  const stmt = db.prepare("SELECT 1 FROM seen_articles WHERE hash = ?");
  try {
    stmt.bind([hash]);
    const exists = stmt.step();
    return exists;
  } finally {
    stmt.free();
  }
}

/**
 * Filter out already-seen articles. Returns only new ones.
 */
async function filterNew(articles, template = "default", windowHours = 48) {
  await init();

  // Parameterized: windowHours is validated as integer
  const hours = parseInt(windowHours, 10);
  if (!Number.isFinite(hours) || hours < 0 || hours > 24 * 365) {
    throw new Error(`Invalid windowHours: ${windowHours}`);
  }
  // SQLite modifier: "-N hours" must be built safely
  db.run("DELETE FROM seen_articles WHERE first_seen < datetime('now', ?)", [`-${hours} hours`]);

  const newArticles = [];
  const insert = db.prepare(
    "INSERT OR IGNORE INTO seen_articles (hash, title, url, template) VALUES (?, ?, ?, ?)"
  );
  try {
    for (const a of articles) {
      const hash = fingerprint(a);
      if (!hashExists(hash)) {
        insert.run([hash, a.title || "", a.url || "", template]);
        newArticles.push(a);
      }
    }
  } finally {
    insert.free();
  }
  await save();
  return newArticles;
}

async function close() {
  if (db) {
    await save();
    db.close();
    db = null;
    initPromise = null;
  }
}

module.exports = { filterNew, close };
