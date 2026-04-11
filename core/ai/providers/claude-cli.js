/**
 * Claude CLI provider — uses `claude` command (Max plan subscription).
 * No API key needed. Uses your logged-in Max plan quota.
 *
 * Async implementation via spawn to avoid blocking the event loop.
 * A 2-minute execSync call would freeze the web server, cron, and
 * breaking monitor — so we stream stdin/stdout via spawn.
 */
const { spawn } = require("child_process");

const CLAUDE_CMD = process.platform === "win32" ? "claude.cmd" : "claude";

function call(model, systemPrompt, userPrompt) {
  const fullPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;

  return new Promise((resolve, reject) => {
    const child = spawn(
      CLAUDE_CMD,
      ["-p", "--output-format", "json", "--dangerously-skip-permissions"],
      {
        shell: process.platform === "win32",
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      }
    );

    let stdout = "";
    let stderr = "";
    let killed = false;

    const timeout = setTimeout(() => {
      killed = true;
      try { child.kill("SIGKILL"); } catch {}
      reject(new Error("Claude CLI timeout (120s)"));
    }, 120000);

    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });

    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(new Error(`Claude CLI spawn failed: ${err.message}`));
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      if (killed) return;
      if (code !== 0 && !stdout.trim()) {
        return reject(new Error(`Claude CLI exit ${code}: ${stderr.slice(0, 200)}`));
      }
      const out = stdout.trim();
      try {
        const json = JSON.parse(out);
        resolve(json.result || json.content || out);
      } catch {
        resolve(out);
      }
    });

    child.stdin.write(fullPrompt);
    child.stdin.end();
  });
}

module.exports = { call };
