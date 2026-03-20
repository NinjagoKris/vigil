<img src="vigil.png" alt="Vigil" width="120" />

# Vigil

*Never sleep on your agents.*

[![CI](https://github.com/NinjagoKris/vigil/actions/workflows/ci.yml/badge.svg)](https://github.com/NinjagoKris/vigil/actions)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Telegram Bot](https://img.shields.io/badge/telegram-@VigilTONBot-26A5E4?logo=telegram&logoColor=white)](https://t.me/VigilTONBot)

---

Vigil watches your AI agents on TON so you don't have to.
Add a wallet address, get instant alerts when something's off. That's it.

It connects to the [Toncenter Streaming API v2](https://toncenter.com/) over a single WebSocket — no polling, no delays, up to 500 wallets at once. Alerts hit your Telegram within seconds of block finalization.

## 🚀 Try it now

**[@VigilTONBot](https://t.me/VigilTONBot)** — open the bot, send `/watch <address> <name>`, done. No setup, no API keys.

## 💬 Commands

| Command | What it does |
|---------|-------------|
| `/start` | Shows welcome + menu buttons |
| `/watch <address> <name>` | Start monitoring an agent |
| `/unwatch <address>` | Stop monitoring |
| `/list` | Your agents with balances |
| `/status <address>` | Deep dive into one agent |
| `/dashboard` | Everything at a glance |
| `/history <address>` | Last 20 transactions |
| `/alerts` | Toggle & configure alerts |

Everything is navigable via inline buttons — you rarely need to type commands after `/start`.

## 🔔 Alerts

Six built-in alert types, all configurable with inline buttons:

| Type | Default | Fires when... |
|------|---------|--------------|
| 🪫 Low Balance | < 0.05 TON | Agent is running out of funds |
| 💸 Large TX | > 1 TON | Big transfer in or out |
| 💤 Inactive | > 24h | Agent hasn't done anything |
| ⚡ High Frequency | > 50/hour | Suspicious burst of activity |
| 🆕 New Contract | — | Agent talks to an unknown contract |
| 📉 Balance Drop | > 50%/hour | Rapid balance decrease |

## 🏗 How it works

**Telegram bot** (grammY) handles user interaction — commands, inline buttons, alert delivery.

**WebSocket stream** stays connected to Toncenter Streaming API v2 and receives finalized transactions in real-time for all watched addresses.

**Analyzer** parses each transaction, stores it in SQLite, checks alert rules, and fires notifications to watching users.

**MCP server** exposes the same data to AI assistants via Model Context Protocol.

Stack: TypeScript, grammY, ws, better-sqlite3, @modelcontextprotocol/sdk.

## 🖥 Self-Hosted

Want to run your own instance:

```bash
git clone https://github.com/NinjagoKris/vigil.git
cd vigil
npm install
cp .env.example .env
```

Fill in `.env`:
```
BOT_TOKEN=your_telegram_bot_token
TONCENTER_API_KEY=your_toncenter_api_key
```

Get a bot token from [@BotFather](https://t.me/BotFather). Get a Toncenter key from [toncenter.com](https://toncenter.com/).

```bash
npm run dev    # dev with hot reload
npm start      # production
npm test       # run tests
npm run mcp    # MCP server (stdio)
```

<details>
<summary>📂 Project structure</summary>

```
src/
├── index.ts           — bootstrap
├── bot/
│   ├── commands.ts    — command handlers + inline buttons
│   ├── alerts.ts      — alert settings keyboard
│   └── formatters.ts  — message formatting
├── monitor/
│   ├── stream.ts      — WebSocket to Toncenter
│   ├── analyzer.ts    — transaction processing
│   └── rules.ts       — alert rule engine
├── mcp/
│   └── server.ts      — MCP stdio server
├── db/
│   ├── schema.ts      — SQLite schema
│   └── queries.ts     — data access layer
└── ton/
    └── client.ts      — HTTP balance fallback
```

</details>

## 🤖 MCP Server

For AI agent developers — Vigil exposes tools via [Model Context Protocol](https://modelcontextprotocol.io):

```bash
npm run mcp
```

Add to your client config:

```json
{
  "mcpServers": {
    "vigil": {
      "command": "npx",
      "args": ["tsx", "src/mcp/server.ts"],
      "cwd": "/path/to/vigil"
    }
  }
}
```

**Tools:** `watch_agent`, `unwatch_agent`, `list_agents`, `get_agent_status`, `get_agent_history`, `get_alerts`

## 🔒 Security

- Read-only — never stores or touches private keys
- No hardcoded secrets — everything via `process.env`
- DB and `.env` excluded from git

---

Built for the [TON AI Agent Hackathon 2026](https://identityhub.app/contests/ai-hackathon) — User-Facing AI Agents Track

Powered by [Toncenter Streaming API v2](https://toncenter.com/) · MIT License
