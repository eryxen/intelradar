const Parser = require('rss-parser');
const yaml = require('yaml');
const fs = require('fs');
const path = require('path');

const TEMPLATES_DIR = path.join(__dirname, 'templates');
const CONCURRENCY = 20;
const TIMEOUT_MS = 10000;

const parser = new Parser({
  timeout: TIMEOUT_MS,
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; IntelRadarFeedTester/1.0)'
  }
});

function collectFeeds() {
  const files = fs.readdirSync(TEMPLATES_DIR).filter(f =>
    f.endsWith('.yml') && f !== 'custom.example.yml'
  );
  const all = [];
  for (const file of files) {
    const full = path.join(TEMPLATES_DIR, file);
    let doc;
    try {
      doc = yaml.parse(fs.readFileSync(full, 'utf8'));
    } catch (e) {
      console.error(`YAML parse error in ${file}: ${e.message}`);
      continue;
    }
    const feeds = (doc && doc.feeds) || [];
    for (const f of feeds) {
      if (f && f.url) {
        all.push({ template: file, name: f.name || '(unnamed)', url: f.url });
      }
    }
  }
  return all;
}

async function testOne(feed) {
  const started = Date.now();
  try {
    const parsed = await parser.parseURL(feed.url);
    const itemCount = (parsed.items || []).length;
    return { ...feed, ok: true, itemCount, ms: Date.now() - started };
  } catch (err) {
    const msg = (err && err.message) || String(err);
    let category = 'other';
    if (/ECONNREFUSED/i.test(msg)) category = 'conn_refused';
    else if (/ENOTFOUND|getaddrinfo/i.test(msg)) category = 'dns';
    else if (/ETIMEDOUT|timeout|timed out/i.test(msg)) category = 'timeout';
    else if (/certificate|SSL|TLS|self.?signed|CERT_/i.test(msg)) category = 'ssl';
    else if (/Status code 404/i.test(msg)) category = '404';
    else if (/Status code 403/i.test(msg)) category = '403';
    else if (/Status code 401/i.test(msg)) category = '401';
    else if (/Status code 429/i.test(msg)) category = '429';
    else if (/Status code 5\d\d/i.test(msg)) category = '5xx';
    else if (/Status code/i.test(msg)) category = 'http_other';
    else if (/Non-whitespace before first tag|Unexpected (close tag|end)|Invalid character|Unable to parse XML|Feed not recognized/i.test(msg)) category = 'invalid_xml';
    else if (/socket hang up|ECONNRESET/i.test(msg)) category = 'reset';
    return { ...feed, ok: false, error: msg.slice(0, 200), category, ms: Date.now() - started };
  }
}

async function runPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const idx = next++;
      if (idx >= items.length) return;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

(async () => {
  const feeds = collectFeeds();
  console.error(`Testing ${feeds.length} feeds across templates...`);
  const results = await runPool(feeds, async (f, i) => {
    const r = await testOne(f);
    if ((i + 1) % 25 === 0) console.error(`  ${i + 1}/${feeds.length} done`);
    return r;
  }, CONCURRENCY);

  const byTemplate = {};
  for (const r of results) {
    byTemplate[r.template] = byTemplate[r.template] || { pass: 0, fail: 0, failures: [] };
    if (r.ok) byTemplate[r.template].pass++;
    else {
      byTemplate[r.template].fail++;
      byTemplate[r.template].failures.push(r);
    }
  }

  const out = {
    total: results.length,
    passed: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length,
    byTemplate,
    failures: results.filter(r => !r.ok)
  };

  fs.writeFileSync(path.join(__dirname, 'feed-test-results.json'), JSON.stringify(out, null, 2));
  console.error(`\nTotal: ${out.total}  Passed: ${out.passed}  Failed: ${out.failed}`);
  console.error('Per template:');
  for (const [t, s] of Object.entries(byTemplate)) {
    console.error(`  ${t}: ${s.pass} pass / ${s.fail} fail`);
  }
  console.error('\nResults written to feed-test-results.json');
})();
