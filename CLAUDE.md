# IntelRadar

AI-powered multi-source intelligence briefing bot.

## Architecture

- `core/collectors/` — Data source adapters (RSS, Polymarket, NewsAPI)
- `core/ai/` — AI processing (filter, summarize, classify) with multi-provider support
- `core/ai/providers/` — Claude, OpenAI, Ollama adapters
- `core/delivery/` — Output channels (Telegram, Discord, Webhook)
- `templates/` — YAML domain templates with RSS sources and keywords
- `index.js` — Main entry, `core/scheduler.js` — Cron orchestration

## Conventions

- Node.js, no TypeScript, CommonJS (require)
- Config via YAML (`config.yml`) + env vars (`.env`)
- SQLite for dedup/history (`data/intelradar.db`)
- All AI calls go through `core/ai/index.js` which routes to the configured provider
- Templates are YAML files in `templates/` with sources, keywords, and filter rules
- Briefings are HTML-formatted for Telegram
