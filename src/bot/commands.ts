import { Bot, type Context } from "grammy";
import type { Queries } from "../db/queries.js";
import type { ToncenterStream } from "../monitor/stream.js";
import {
  formatStart,
  formatDashboard,
  formatAgentList,
  formatStatus,
  formatHistory,
  formatAlertSettings,
} from "./formatters.js";
import { buildAlertKeyboard, handleAlertCallback } from "./alerts.js";

export function registerCommands(
  bot: Bot,
  queries: Queries,
  stream: ToncenterStream
): void {
  bot.command("start", async (ctx: Context) => {
    await ctx.reply(formatStart(), { parse_mode: "HTML" });
  });

  bot.command("watch", async (ctx: Context) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const args = ctx.message?.text?.split(/\s+/).slice(1) || [];
    if (args.length < 2) {
      await ctx.reply(
        "Usage: /watch <code>&lt;address&gt; &lt;name&gt;</code>\n\nExample:\n<code>/watch EQBCVd...v_br TranslationAgent</code>",
        { parse_mode: "HTML" }
      );
      return;
    }

    const address = args[0];
    const name = args.slice(1).join(" ");

    // Basic address validation
    if (!address.match(/^(EQ|UQ|0:)[A-Za-z0-9_\-+/]{20,}/)) {
      await ctx.reply("Invalid TON address format.");
      return;
    }

    queries.addAgent(userId, address, name);
    stream.subscribe([address]);

    await ctx.reply(
      `✅ Now watching <b>${name}</b>\n<code>${address}</code>\n\nYou'll receive alerts for this agent.`,
      { parse_mode: "HTML" }
    );
  });

  bot.command("unwatch", async (ctx: Context) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const args = ctx.message?.text?.split(/\s+/).slice(1) || [];
    if (args.length < 1) {
      await ctx.reply("Usage: /unwatch <code>&lt;address&gt;</code>", {
        parse_mode: "HTML",
      });
      return;
    }

    const address = args[0];
    const removed = queries.removeAgent(userId, address);

    if (removed) {
      // Check if anyone else is watching this address
      const others = queries.getUsersWatchingAddress(address);
      if (others.length === 0) {
        stream.unsubscribe([address]);
      }
      await ctx.reply(`Stopped watching <code>${address}</code>`, {
        parse_mode: "HTML",
      });
    } else {
      await ctx.reply("Agent not found in your watchlist.");
    }
  });

  bot.command("list", async (ctx: Context) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const agents = queries.getAgentsByUser(userId);
    await ctx.reply(formatAgentList(agents), { parse_mode: "HTML" });
  });

  bot.command("status", async (ctx: Context) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const args = ctx.message?.text?.split(/\s+/).slice(1) || [];
    if (args.length < 1) {
      await ctx.reply("Usage: /status <code>&lt;address&gt;</code>", {
        parse_mode: "HTML",
      });
      return;
    }

    const address = args[0];
    const agent = queries.getAgent(userId, address);
    if (!agent) {
      await ctx.reply("Agent not found. Use /watch to add it first.");
      return;
    }

    const stats = queries.getTodayStats(address);
    const recentTxns = queries.getTransactions(address, 5);
    await ctx.reply(formatStatus(agent, stats, recentTxns), {
      parse_mode: "HTML",
    });
  });

  bot.command("alerts", async (ctx: Context) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    // Ensure settings exist
    const agents = queries.getAgentsByUser(userId);
    if (agents.length === 0) {
      await ctx.reply(
        "Add an agent first with /watch to configure alerts."
      );
      return;
    }

    const settings = queries.getAlertSettings(userId);
    if (settings.length === 0) {
      // Trigger settings creation by re-adding first agent
      queries.addAgent(userId, agents[0].address, agents[0].name);
      const freshSettings = queries.getAlertSettings(userId);
      await ctx.reply(formatAlertSettings(freshSettings), {
        parse_mode: "HTML",
        reply_markup: buildAlertKeyboard(freshSettings),
      });
      return;
    }

    await ctx.reply(formatAlertSettings(settings), {
      parse_mode: "HTML",
      reply_markup: buildAlertKeyboard(settings),
    });
  });

  bot.command("dashboard", async (ctx: Context) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const agents = queries.getAgentsByUser(userId);
    const stats = new Map<string, { count: number; volume: string }>();

    for (const agent of agents) {
      stats.set(agent.address, queries.getTodayStats(agent.address));
    }

    await ctx.reply(formatDashboard(agents, stats), {
      parse_mode: "HTML",
    });
  });

  bot.command("history", async (ctx: Context) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const args = ctx.message?.text?.split(/\s+/).slice(1) || [];
    if (args.length < 1) {
      await ctx.reply("Usage: /history <code>&lt;address&gt;</code>", {
        parse_mode: "HTML",
      });
      return;
    }

    const address = args[0];
    const agent = queries.getAgent(userId, address);
    if (!agent) {
      await ctx.reply("Agent not found. Use /watch to add it first.");
      return;
    }

    const transactions = queries.getTransactions(address, 20);
    await ctx.reply(formatHistory(agent.name, transactions), {
      parse_mode: "HTML",
    });
  });

  // Handle alert toggle callbacks
  bot.callbackQuery(/^toggle_alert:(.+)$/, async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const alertType = ctx.match[1];
    const { text, keyboard } = handleAlertCallback(queries, userId, alertType);

    await ctx.editMessageText(text, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
    await ctx.answerCallbackQuery();
  });
}
