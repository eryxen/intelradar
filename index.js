#!/usr/bin/env node
/**
 * IntelRadar — AI-powered multi-source intelligence briefing bot.
 *
 * Usage:
 *   node index.js          # Start cron scheduler
 *   node index.js --once   # Run once and exit (dev/testing)
 */

// Load env
const path = require("path");
const fs = require("fs");

const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

// Load YAML config if exists
const YAML = require("yaml");
const configPath = path.join(__dirname, "config.yml");
if (fs.existsSync(configPath)) {
  const cfg = YAML.parse(fs.readFileSync(configPath, "utf-8"));
  // Map config.yml values to env vars (env vars take precedence)
  if (cfg.schedule?.cron && !process.env.CRON_SCHEDULE) process.env.CRON_SCHEDULE = cfg.schedule.cron;
  if (cfg.schedule?.timezone && !process.env.TIMEZONE) process.env.TIMEZONE = cfg.schedule.timezone;
  if (cfg.templates && !process.env.TEMPLATES) process.env.TEMPLATES = cfg.templates.join(",");
  if (cfg.briefing?.language && !process.env.LANGUAGE) process.env.LANGUAGE = cfg.briefing.language;
  if (cfg.briefing?.maxArticles && !process.env.MAX_ARTICLES_PER_RUN) process.env.MAX_ARTICLES_PER_RUN = String(cfg.briefing.maxArticles);
  if (cfg.ai?.provider && !process.env.AI_PROVIDER) process.env.AI_PROVIDER = cfg.ai.provider;
  if (cfg.ai?.filterModel && !process.env.AI_MODEL_FILTER) process.env.AI_MODEL_FILTER = cfg.ai.filterModel;
  if (cfg.ai?.summaryModel && !process.env.AI_MODEL_SUMMARY) process.env.AI_MODEL_SUMMARY = cfg.ai.summaryModel;
}

const scheduler = require("./core/scheduler");
const dedup = require("./core/dedup");
const templateLoader = require("./core/template-loader");
const webServer = require("./core/web-server");

// Ensure data directory
const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

async function main() {
  const isOnce = process.argv.includes("--once");

  console.log(`
  ╔══════════════════════════════════════╗
  ║       📡 IntelRadar v0.1.0          ║
  ║  AI Intelligence Briefing Bot       ║
  ╚══════════════════════════════════════╝
  `);

  const available = templateLoader.listAll();
  console.log(`Available templates: ${available.join(", ")}`);
  console.log(`Active: ${process.env.TEMPLATES || "crypto,ai-tech"}`);
  console.log(`AI Provider: ${process.env.AI_PROVIDER || "claude"}`);
  console.log(`Language: ${process.env.LANGUAGE || "zh"}`);
  console.log(`Breaking monitor: ${process.env.BREAKING_ENABLED !== "false" ? "ON" : "OFF"} (threshold=${process.env.BREAKING_THRESHOLD || "8"}, max ${process.env.BREAKING_MAX_PER_HOUR || "5"}/hr)`);
  console.log("");

  if (isOnce) {
    console.log("Running single cycle (--once mode)...\n");
    await scheduler.runAll();
    dedup.close();
    process.exit(0);
  }

  // Cron mode
  scheduler.start();

  // Web dashboard
  if (process.env.WEB_ENABLED !== "false") {
    webServer.setScheduler(scheduler);
    webServer.start(parseInt(process.env.WEB_PORT) || 3000);
  }

  // Run immediately on start if configured
  const runOnStart = process.env.RUN_ON_START !== "false";
  if (runOnStart) {
    console.log("Running initial cycle...\n");
    await scheduler.runAll();
  }

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log("\nShutting down...");
    dedup.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
