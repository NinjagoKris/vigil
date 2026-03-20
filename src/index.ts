import "dotenv/config";
import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { Bot, webhookCallback } from "grammy";
import { initDatabase } from "./db/schema.js";
import { Queries } from "./db/queries.js";
import { ToncenterStream } from "./monitor/stream.js";
import { TransactionAnalyzer } from "./monitor/analyzer.js";
import { startInactivityChecker } from "./monitor/inactivity.js";
import { registerCommands } from "./bot/commands.js";
import { formatAlert } from "./bot/formatters.js";
import type { ToncenterTransaction } from "./monitor/stream.js";

// Validate required env vars
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error("BOT_TOKEN is required. Set it in .env file.");
  process.exit(1);
}

// Webhook URL for cloud deployment (e.g. HF Spaces)
const WEBHOOK_URL = process.env.WEBHOOK_URL || "";

// Init database
const db = initDatabase();
const queries = new Queries(db);

// Init Telegram bot
const bot = new Bot(BOT_TOKEN);
bot.catch((err) => {
  console.error("[Bot] Error:", err.message || err);
});

// Init WebSocket stream
const stream = new ToncenterStream({
  url:
    process.env.TONCENTER_WS_URL ||
    "wss://toncenter.com/api/streaming/v2/ws",
  apiKey: process.env.TONCENTER_API_KEY,
});

// Init transaction analyzer
const analyzer = new TransactionAnalyzer(queries);

// Register bot commands
registerCommands(bot, queries, stream);

// ── Rate-limited alert sender ───────────────────────
const alertQueue: Array<{ userId: number; message: string }> = [];
let alertDraining = false;

function enqueueAlert(userId: number, message: string): void {
  alertQueue.push({ userId, message });
  if (!alertDraining) drainAlertQueue();
}

async function drainAlertQueue(): Promise<void> {
  alertDraining = true;
  while (alertQueue.length > 0) {
    const item = alertQueue.shift()!;
    try {
      await bot.api.sendMessage(item.userId, item.message, {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      });
    } catch (err: unknown) {
      const error = err as { error_code?: number; parameters?: { retry_after?: number } };
      if (error.error_code === 429) {
        const retryAfter = error.parameters?.retry_after || 1;
        console.warn(`[Alert] Rate limited, waiting ${retryAfter}s`);
        alertQueue.unshift(item);
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        continue;
      }
      console.error(`[Alert] Failed to send to user ${item.userId}:`, err);
    }
    await new Promise((r) => setTimeout(r, 35));
  }
  alertDraining = false;
}

// ── Handle incoming transactions from WebSocket ─────
stream.on(
  "transaction",
  async (tx: ToncenterTransaction, _finality: string) => {
    try {
      const { alerts, userIds } = await analyzer.processTransaction(tx);

      for (const alert of alerts) {
        const message = formatAlert(alert);
        for (const userId of userIds) {
          enqueueAlert(userId, message);
        }
      }
    } catch (err) {
      console.error("[Main] Error processing transaction:", err);
    }
  }
);

// Handle balance updates from account_state_change events
stream.on("balance", (address: string, balanceNano: string) => {
  analyzer.handleBalanceUpdate(address, balanceNano);
});

// Start inactivity checker (runs every hour, with dedup)
const inactivityTimer = startInactivityChecker(bot, queries);

// ── Start everything ────────────────────────────────
async function main(): Promise<void> {
  console.log("Starting Vigil...");

  // Subscribe to all existing watched addresses
  const addresses = queries.getAllWatchedAddresses();
  if (addresses.length > 0) {
    stream.subscribe(addresses);
    console.log(`[Init] Subscribed to ${addresses.length} existing addresses`);
  }

  // Connect WebSocket
  stream.connect();

  if (WEBHOOK_URL) {
    // ── Webhook mode (for HF Spaces / cloud) ──────────
    const handleUpdate = webhookCallback(bot, "http");

    const PORT = parseInt(process.env.PORT || "7860", 10);
    createServer(async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method === "POST" && req.url === "/webhook") {
        await handleUpdate(req, res);
      } else {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("Vigil is running");
      }
    }).listen(PORT, async () => {
      console.log(`[Server] Listening on port ${PORT}`);

      // Set webhook at Telegram
      await bot.api.setWebhook(`${WEBHOOK_URL}/webhook`, {
        drop_pending_updates: true,
      });
      console.log(`[Bot] Webhook set to ${WEBHOOK_URL}/webhook`);
      console.log("[Bot] Vigil is online. Never sleep on your agents.");
    });
  } else {
    // ── Polling mode (local dev) ──────────────────────
    const PORT = parseInt(process.env.PORT || "7860", 10);
    createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Vigil is running");
    }).listen(PORT, () => {
      console.log(`[Health] Listening on port ${PORT}`);
    });

    bot.start({
      drop_pending_updates: true,
      onStart: () => {
        console.log("[Bot] Vigil is online. Never sleep on your agents.");
      },
    });
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

// Graceful shutdown
function shutdown(): void {
  console.log("\nShutting down...");
  clearInterval(inactivityTimer);
  stream.close();
  bot.stop();
  db.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
