# 📡 IntelRadar

**AI-powered multi-source intelligence briefing bot with prediction market integration.**

IntelRadar collects news from RSS feeds, filters noise with AI, correlates stories with [Polymarket](https://polymarket.com) prediction markets, and delivers concise intelligence briefings to Telegram, Discord, or any webhook.

[中文文档](README.zh-CN.md)

---

## Features

- **Multi-source collection** — RSS feeds as primary, extensible to any source
- **AI-powered filtering** — Cheap/fast model (Haiku) scores relevance, removes noise and duplicates
- **Smart summarization** — Capable model (Sonnet) generates analyst-grade briefings
- **Prediction market correlation** — Automatically matches news to active Polymarket events with live odds
- **Multi-provider AI** — Claude, OpenAI, or local Ollama — your choice
- **Multi-channel delivery** — Telegram, Discord, generic webhook
- **Domain templates** — Pre-built for crypto, AI/tech, sports, politics, finance — or create your own
- **SQLite deduplication** — Never see the same story twice
- **Self-hosted** — Your data, your server, your rules

## Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/xen/intelradar.git
cd intelradar
npm install
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env with your tokens and preferences
```

Required:
- `TG_BOT_TOKEN` — Create a bot via [@BotFather](https://t.me/BotFather)
- `TG_CHANNEL_ID` — Your channel/group ID
- `ANTHROPIC_API_KEY` — From [console.anthropic.com](https://console.anthropic.com) (or use OpenAI/Ollama)

### 3. Run

```bash
# Run once (test)
node index.js --once

# Start scheduler (production)
node index.js
```

### Docker

```bash
cp .env.example .env
# Edit .env
docker-compose up -d
```

## Architecture

```
RSS Feeds ──┐
NewsAPI ────┤  ┌──────────┐   ┌──────────┐   ┌──────────┐
Reddit ─────┼──│ Collector │──▶│ AI Filter │──▶│Summarizer│──▶ Telegram
Twitter ────┤  └──────────┘   └──────────┘   └────┬─────┘    Discord
Custom ─────┘                                      │          Webhook
                                              ┌────▼─────┐
                               Polymarket ───▶│Correlator │
                                              └──────────┘
```

## Templates

Pre-built domain templates in `templates/`:

| Template | Sources | Description |
|----------|---------|-------------|
| `crypto` | CoinDesk, CoinTelegraph, The Block, Decrypt... | Crypto & Web3 |
| `ai-tech` | TechCrunch, The Verge, HN, arXiv, Anthropic... | AI & Technology |
| `sports` | ESPN, BBC Sport, Sky Sports... | Major sports |
| `politics` | Reuters, BBC World, Al Jazeera, AP... | Geopolitics |
| `finance` | CNBC, Bloomberg, MarketWatch... | Markets & macro |

### Create your own

```bash
cp templates/custom.example.yml templates/gaming.yml
# Edit with your sources and keywords
# Add "gaming" to TEMPLATES in .env
```

## AI Providers

| Provider | Model (Filter) | Model (Summary) | Cost |
|----------|---------------|-----------------|------|
| **Claude** | claude-haiku-4-5 | claude-sonnet-4-6 | ~$0.02/briefing |
| **OpenAI** | gpt-4o-mini | gpt-4o | ~$0.03/briefing |
| **Ollama** | llama3 | llama3 | Free (local) |

Set `AI_PROVIDER=ollama` for completely free operation with local models.

## Prediction Market Integration

IntelRadar automatically correlates news with active Polymarket events:

```
📰 "SEC announces new crypto regulatory framework"
   ├── 🔮 Will SEC approve spot ETH ETF by July? → Yes: 72% / No: 28%
   └── 🔮 Bitcoin above $100k by end of 2026? → Yes: 61% / No: 39%
```

Enable/disable per template in YAML config.

## Configuration

### Environment Variables

See [`.env.example`](.env.example) for all options.

### YAML Config

Copy `config.example.yml` to `config.yml` for advanced configuration including schedule, delivery channels, and AI settings.

## Roadmap

- [ ] Twitter/X source collector
- [ ] Reddit source collector
- [ ] Web dashboard for configuration
- [ ] Telegram Stars subscription (paid tier)
- [ ] Real-time alerts for breaking news
- [ ] Multi-language briefings in single run
- [ ] Plugin system for custom collectors

## Contributing

PRs welcome! See [CONTRIBUTING.md](docs/CONTRIBUTING.md) for guidelines.

1. Fork the repo
2. Create your feature branch (`git checkout -b feature/amazing`)
3. Commit your changes
4. Push and open a PR

## License

[MIT](LICENSE) — Use it however you want.

---

Built with [Claude Code](https://claude.ai/code) | Powered by [Anthropic](https://anthropic.com)
