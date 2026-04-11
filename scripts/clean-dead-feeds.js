/**
 * Remove feeds marked as dead (404, dns, ssl) from template YAML files.
 * Reads feed-test-results.json and strips matching entries in-place.
 *
 * Usage: node scripts/clean-dead-feeds.js [--dry-run]
 */
const fs = require("fs");
const path = require("path");

const DRY = process.argv.includes("--dry-run");
const results = require("../feed-test-results.json");
const templatesDir = path.join(__dirname, "..", "templates");

// Categories worth removing — permanent failures
const KILL_CATEGORIES = new Set(["404", "dns", "ssl"]);

let totalRemoved = 0;

Object.entries(results.byTemplate).forEach(([tplFile, data]) => {
  const ymlPath = path.join(templatesDir, tplFile);
  if (!fs.existsSync(ymlPath)) return;

  const deadUrls = new Set(
    (data.failures || [])
      .filter((f) => KILL_CATEGORIES.has(f.category))
      .map((f) => f.url)
  );
  if (!deadUrls.size) return;

  let yml = fs.readFileSync(ymlPath, "utf-8");
  const lines = yml.split("\n");
  const out = [];
  let i = 0;
  let removed = 0;

  while (i < lines.length) {
    const line = lines[i];
    // Match `  - name: ...` followed by `    url: ...`
    if (/^\s+-\s+name:/.test(line) && i + 1 < lines.length) {
      const next = lines[i + 1];
      const urlMatch = next.match(/^\s+url:\s*(.+)$/);
      if (urlMatch) {
        const url = urlMatch[1].trim().replace(/^["']|["']$/g, "");
        if (deadUrls.has(url)) {
          removed++;
          i += 2;
          // Also drop trailing blank line if block was isolated
          continue;
        }
      }
    }
    out.push(line);
    i++;
  }

  if (removed > 0) {
    console.log(`${tplFile.padEnd(25)} removed ${removed} dead feeds`);
    totalRemoved += removed;
    if (!DRY) fs.writeFileSync(ymlPath, out.join("\n"), "utf-8");
  }
});

console.log(`\n${DRY ? "[DRY RUN] Would remove" : "Removed"} ${totalRemoved} dead feeds total`);
