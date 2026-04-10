/**
 * Claude CLI provider — uses `claude` command (Max plan subscription).
 * No API key needed. Uses your logged-in Max plan quota.
 * This is the zero-cost option for Max subscribers.
 */
const { execSync } = require("child_process");

const CLAUDE_CMD = process.platform === "win32" ? "claude.cmd" : "claude";

function call(model, systemPrompt, userPrompt) {
  // claude -p sends a single prompt and returns the result
  // --model is ignored by CLI (uses your subscription model)
  // --output-format json gives us structured output
  const fullPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;

  try {
    const result = execSync(
      `${CLAUDE_CMD} -p --output-format json --dangerously-skip-permissions`,
      {
        input: fullPrompt,
        encoding: "utf-8",
        timeout: 120000, // 2 min timeout
        maxBuffer: 1024 * 1024, // 1MB
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      }
    );

    // Parse JSON output
    try {
      const json = JSON.parse(result.trim());
      return json.result || json.content || result.trim();
    } catch {
      // If not JSON, return raw text
      return result.trim();
    }
  } catch (err) {
    // If command fails, try to extract output from error
    if (err.stdout) {
      const out = err.stdout.toString().trim();
      try { return JSON.parse(out).result || out; } catch { return out; }
    }
    throw new Error(`Claude CLI failed: ${err.message}`);
  }
}

module.exports = { call };
