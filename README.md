<div align="center">

<img src="vigil.png" alt="Vigil" width="200" />

# Vigil

**Never sleep on your agents**

Real-time monitoring of AI agents on TON blockchain via Telegram

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

</div>

---

## What is Vigil?

Vigil is a Telegram bot that monitors AI agent wallets on the TON blockchain in real-time. It uses the **Toncenter Streaming API v2** (WebSocket) for instant transaction notifications — no polling, no delays.

Track balances, get alerts on suspicious activity, and view dashboards — all from Telegram. Also includes an **MCP server** for integration with AI assistants.

## Features

- **Real-time WebSocket streaming** — 1-3 second notification delay after block finalization
- **6 alert types** — low balance, large transactions, inactivity, high frequency, new contracts, balance drops
- **Interactive dashboard** — overview of all monitored agents with stats
- **Transaction history** — last 20 transactions per agent
- **Inline alert settings** — toggle alerts and adjust thresholds via Telegram buttons
- **MCP server** — stdio + HTTP transport for AI assistant integration
- **SQLite storage** — lightweight, zero-config persistence
- **Auto-reconnect** — exponential backoff (1s → 30s max) on WebSocket disconnect

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/vigil.git
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
```

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
                     │  (Streaming v2)    │     │  API v2      │
                     └────────────────────┘     └──────────────┘

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

## Security

- **Read-only monitoring** — Vigil never stores or handles private keys
- **No hardcoded secrets** — all credentials via environment variables
- **SQLite excluded from git** — `.gitignore` covers `*.db` and `.env`

---

<div align="center">

Powered by [Toncenter Streaming API v2](https://toncenter.com/)

MIT License

</div>
