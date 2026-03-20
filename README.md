<div align="center">

<img src="vigil.png" alt="Vigil" width="200" />

# Vigil

**Never sleep on your agents**

Real-time monitoring of AI agents on TON blockchain via Telegram

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TON](https://img.shields.io/badge/TON-Mainnet-0088CC?logo=ton&logoColor=white)](#)
[![MCP](https://img.shields.io/badge/MCP-6%20tools-blueviolet)](#mcp-server)

</div>

---

## What is Vigil?

Vigil is a Telegram bot that monitors AI agent wallets on the TON blockchain in real-time. It uses the **Toncenter Streaming API v2** (WebSocket) for instant transaction notifications — no polling, no delays.

Track balances, get alerts on suspicious activity, and view dashboards — all from Telegram. Monitor up to 500 agent wallets on a single WebSocket connection. Also includes an **MCP server** for integration with AI assistants.

## Try it now

[@VigilTONBot](https://t.me/VigilTONBot)

Open the bot → `/watch <address> <name>` → done.
No setup, no installation, no API keys needed.

## Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message and instructions |
| `/watch <address> <name>` | Add an agent to monitor |
| `/unwatch <address>` | Remove an agent |
| `/list` | List your agents with balances |
| `/status <address>` | Detailed agent status |
| `/alerts` | Configure alert settings |
| `/dashboard` | Overview of all agents |
| `/history <address>` | Last 20 transactions |

## Alert Types

| Alert | Default Threshold | Description |
|-------|-------------------|-------------|
| **Low Balance** | 0.05 TON | Balance below threshold |
| **Large Transaction** | 1 TON | Single transaction exceeds threshold |
| **Inactive** | 24 hours | No activity for specified duration |
| **High Frequency** | 50 txns/hour | Unusual transaction volume |
| **New Contract** | — | Interaction with previously unseen contract |
| **Balance Drop** | 50% | Balance dropped significantly within 1 hour |

All alerts are configurable via `/alerts` with inline buttons.

## Architecture

```
┌──────────────┐     ┌────────────────────┐     ┌──────────────┐
│   Telegram   │◄────│     Vigil Bot       │────►│   SQLite DB  │
│    Users     │     │    (grammY)         │     │              │
└──────────────┘     └────────┬───────────┘     └──────────────┘
                              │                        ▲
                     ┌────────▼───────────┐            │
                     │  Transaction       │────────────┘
                     │  Analyzer          │
                     └────────┬───────────┘
                              │
                     ┌────────▼───────────┐     ┌──────────────┐
                     │  WebSocket Stream  │◄────│  Toncenter   │
                     │  (Streaming v2)    │     │  Streaming   │
                     └────────────────────┘     │  API v2      │
                                                └──────────────┘

                     ┌────────────────────┐
                     │  MCP Server        │ ← AI assistants
                     │  (stdio/HTTP)      │
                     └────────────────────┘
```

### Stack

- **[grammY](https://grammy.dev/)** — Telegram bot framework
- **[ws](https://github.com/websockets/ws)** — WebSocket client
- **[better-sqlite3](https://github.com/WiseLibs/better-sqlite3)** — SQLite driver
- **[@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/sdk)** — MCP server

## Self-Hosted

Want to run your own instance? Follow these steps.

### 1. Clone and install

```bash
git clone https://github.com/NinjagoKris/vigil.git
cd vigil
npm install
```

### 2. Configure

```bash
cp .env.example .env
```

Edit `.env`:
```
BOT_TOKEN=your_telegram_bot_token
TONCENTER_API_KEY=your_toncenter_api_key
```

Get a bot token from [@BotFather](https://t.me/BotFather).
Get a Toncenter API key from [toncenter.com](https://toncenter.com/).

### 3. Run

```bash
npm run dev    # Development with hot reload
npm start      # Production
npm run mcp    # Start MCP server (stdio)
```

### Directory Structure

```
src/
├── index.ts           — App bootstrap
├── bot/
│   ├── commands.ts    — Telegram command handlers
│   ├── alerts.ts      — Alert settings UI
│   └── formatters.ts  — Message formatting
├── monitor/
│   ├── stream.ts      — WebSocket connection
│   ├── analyzer.ts    — Transaction processing
│   └── rules.ts       — Alert rule engine
├── mcp/
│   └── server.ts      — MCP stdio/HTTP server
├── db/
│   ├── schema.ts      — Database schema
│   └── queries.ts     — Query layer
└── ton/
    └── client.ts      — HTTP fallback
```

## MCP Server

Vigil includes an MCP (Model Context Protocol) server for AI assistant integration.

### Stdio Transport

```bash
npm run mcp
```

Add to your MCP client config:

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

### Available Tools

| Tool | Description |
|------|-------------|
| `watch_agent(address, name)` | Add agent to monitoring |
| `unwatch_agent(address)` | Remove agent |
| `list_agents()` | List all monitored agents |
| `get_agent_status(address)` | Detailed agent status |
| `get_agent_history(address, limit)` | Transaction history |
| `get_alerts()` | Current alert settings |

## Security

- **Read-only monitoring** — Vigil never stores or handles private keys
- **No hardcoded secrets** — all credentials via environment variables
- **SQLite excluded from git** — `.gitignore` covers `*.db` and `.env`

---

<div align="center">

Built for the [TON AI Agent Hackathon 2026](https://identityhub.app/contests/ai-hackathon) — User-Facing AI Agents Track

Powered by [Toncenter Streaming API v2](https://toncenter.com/)

MIT License

</div>
