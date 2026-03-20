import "dotenv/config";
import { Bot } from "grammy";
import { initDatabase } from "./db/schema.js";
import { Queries } from "./db/queries.js";
import { ToncenterStream } from "./monitor/stream.js";
import { TransactionAnalyzer } from "./monitor/analyzer.js";
import { registerCommands } from "./bot/commands.js";
import { formatAlert } from "./bot/formatters.js";
import type { ToncenterTransaction } from "./monitor/stream.js";

// Validate required env vars
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error("BOT_TOKEN is required. Set it in .env file.");
  process.exit(1);
}

// Init database
const db = initDatabase();
const queries = new Queries(db);

// Init Telegram bot
const bot = new Bot(BOT_TOKEN);

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

// Handle incoming transactions from WebSocket
stream.on(
  "transaction",
  async (tx: ToncenterTransaction, _finality: string) => {
    try {
      const { alerts, userIds } = await analyzer.processTransaction(tx);

      // Send alerts to all watching users
      for (const alert of alerts) {
        const message = formatAlert(alert);
        for (const userId of userIds) {
          try {
            await bot.api.sendMessage(userId, message, {
              parse_mode: "HTML",
            });
          } catch (err) {
            console.error(
              `[Alert] Failed to send to user ${userId}:`,
              err
            );
          }
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

// Inactivity checker — runs every hour
const INACTIVITY_CHECK_INTERVAL = 3600000; // 1 hour

setInterval(async () => {
  const addresses = queries.getAllWatchedAddresses();
  const now = Math.floor(Date.now() / 1000);

  for (const address of addresses) {
    const userIds = queries.getUsersWatchingAddress(address);

    for (const userId of userIds) {
      const agent = queries.getAgent(userId, address);
      if (!agent || !agent.last_active) continue;

      const settings = queries.getAlertSettings(userId);
      const inactiveSetting = settings.find(
        (s) => s.alert_type === "inactive" && s.enabled
      );
      if (!inactiveSetting) continue;

      const threshold = parseInt(inactiveSetting.threshold || "86400", 10);
      const inactiveDuration = now - agent.last_active;

      if (inactiveDuration > threshold) {
        const hours = Math.floor(inactiveDuration / 3600);
        const message = `⚠️ <b>INACTIVE</b>\n\n<b>${agent.name}</b>\nNo activity for ${hours} hours`;
        try {
          await bot.api.sendMessage(userId, message, {
            parse_mode: "HTML",
          });
        } catch (err) {
          console.error(
            `[Inactivity] Failed to send to user ${userId}:`,
            err
          );
        }
      }
    }
  }
}, INACTIVITY_CHECK_INTERVAL);

// Start everything
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

  // Start bot
  bot.start({
    onStart: () => {
      console.log("[Bot] Vigil is online. Never sleep on your agents.");
    },
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down...");
  stream.close();
  bot.stop();
  db.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  stream.close();
  bot.stop();
  db.close();
  process.exit(0);
});
