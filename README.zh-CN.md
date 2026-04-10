# 📡 IntelRadar — 情报雷达

**AI 驱动的多源情报简报机器人，集成预测市场关联分析。**

IntelRadar 从 RSS 源采集新闻，用 AI 过滤噪声，将新闻与 [Polymarket](https://polymarket.com) 预测市场自动关联，生成精炼的情报简报推送到 Telegram/Discord。

[English](README.md)

---

## 特性

- **多源采集** — RSS 为主力，可扩展任意数据源
- **AI 去噪** — 快速模型(Haiku)评分过滤，去除噪声和重复
- **智能摘要** — 强模型(Sonnet)生成专业级情报简报
- **预测市场关联** — 自动匹配新闻到 Polymarket 活跃事件，附带实时赔率
- **多 AI 提供商** — Claude / OpenAI / 本地 Ollama，自由选择
- **多渠道推送** — Telegram / Discord / Webhook
- **领域模板** — 内置加密、AI科技、体育、政治、财经，或自建模板
- **SQLite 去重** — 同一新闻不会重复推送
- **自部署** — 你的数据，你的服务器，你做主

## 快速开始

```bash
git clone https://github.com/xen/intelradar.git
cd intelradar
npm install
cp .env.example .env   # 编辑配置
node index.js --once    # 测试运行
node index.js           # 启动定时任务
```

### Docker 部署

```bash
cp .env.example .env && docker-compose up -d
```

## AI 提供商

| 提供商 | 过滤模型 | 摘要模型 | 单次成本 |
|--------|---------|---------|---------|
| **Claude** | Haiku 4.5 | Sonnet 4.6 | ~$0.02 |
| **OpenAI** | GPT-4o-mini | GPT-4o | ~$0.03 |
| **Ollama** | llama3 | llama3 | 免费(本地) |

设置 `AI_PROVIDER=ollama` 即可完全免费运行。

## 预测市场关联

自动将新闻与 Polymarket 预测市场匹配：

```
📰 "SEC 宣布新加密监管框架"
   ├── 🔮 SEC 会在7月前批准 ETH 现货 ETF 吗？→ Yes: 72% / No: 28%
   └── 🔮 2026年底 BTC 会突破10万？→ Yes: 61% / No: 39%
```

## 自定义模板

```bash
cp templates/custom.example.yml templates/gaming.yml
# 编辑你的 RSS 源和关键词
# 在 .env 里把 gaming 加到 TEMPLATES
```

## License

[MIT](LICENSE)
