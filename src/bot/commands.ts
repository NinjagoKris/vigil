import { Bot, InlineKeyboard, type Context } from "grammy";
import type { Queries } from "../db/queries.js";
import type { ToncenterStream } from "../monitor/stream.js";
import {
  formatStart,
  formatDashboard,
  formatAgentList,
  formatStatus,
  formatHistory,
  formatWatchSuccess,
  formatUnwatchSuccess,
  shortAddress,
} from "./formatters.js";
import { buildAlertKeyboard, handleAlertCallback } from "./alerts.js";

// ─── KEYBOARD BUILDERS ──────────────────────────────

function mainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📊 Dashboard", "menu:dashboard")
    .text("📋 My Agents", "menu:agents")
    .row()
    .text("➕ Add Agent", "menu:watch")
    .text("🔔 Alerts", "menu:alerts")
    .row()
    .text("🔄 Refresh", "menu:dashboard");
}

function agentListKeyboard(
  agents: Array<{ address: string; name: string }>
): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const agent of agents) {
    kb.text(
      `${agent.name}`,
      `agent:status:${agent.address}`
    ).row();
  }
  kb.text("➕ Add Agent", "menu:watch").row();
  kb.text("◀️ Back to Menu", "menu:main");
  return kb;
}

function agentDetailKeyboard(address: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("📜 History", `agent:history:${address}`)
    .text("🔄 Refresh", `agent:status:${address}`)
    .row()
    .text("🗑 Unwatch", `agent:unwatch:${address}`)
    .text("◀️ Back", "menu:agents");
}

function backToAgentKeyboard(address: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("◀️ Back to Agent", `agent:status:${address}`)
    .text("🏠 Menu", "menu:main");
}

function backToMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("🏠 Back to Menu", "menu:main");
}

function dashboardKeyboard(
  agents: Array<{ address: string; name: string }>
): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const agent of agents) {
    kb.text(`📍 ${agent.name}`, `agent:status:${agent.address}`).row();
  }
  kb.text("🔄 Refresh", "menu:dashboard")
    .text("➕ Add", "menu:watch")
    .row();
  kb.text("◀️ Menu", "menu:main");
  return kb;
}

function unwatchConfirmKeyboard(address: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Yes, remove", `agent:unwatch_confirm:${address}`)
    .text("❌ Cancel", `agent:status:${address}`);
}

// ─── HELPERS ─────────────────────────────────────────

const waitingForAddress = new Map<
  number,
  { state: "address" | "name"; address?: string }
>();

async function sendOrEdit(
  ctx: Context,
  text: string,
  keyboard: InlineKeyboard
): Promise<void> {
  if (ctx.callbackQuery) {
    try {
      await ctx.editMessageText(text, {
        parse_mode: "HTML",
        reply_markup: keyboard,
      });
    } catch {
      // Message not modified — ignore
    }
  } else {
    await ctx.reply(text, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  }
}

// ─── REGISTER ────────────────────────────────────────

export function registerCommands(
  bot: Bot,
  queries: Queries,
  stream: ToncenterStream
): void {
  // ── /start — Main menu ───────────────────────────
  bot.command("start", async (ctx) => {
    await sendOrEdit(ctx, formatStart(), mainMenuKeyboard());
  });

  // ── /watch — Direct command support ──────────────
  bot.command("watch", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const args = ctx.message?.text?.split(/\s+/).slice(1) || [];
    if (args.length < 2) {
      waitingForAddress.set(userId, { state: "address" });
      await ctx.reply(
        [
          `➕ <b>Add Agent</b>`,
          ``,
          `Send me the TON address to monitor:`,
        ].join("\n"),
        {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard().text(
            "❌ Cancel",
            "menu:main"
          ),
        }
      );
      return;
    }

    const address = args[0];
    const name = args.slice(1).join(" ");

    if (!address.match(/^(EQ|UQ|0:)[A-Za-z0-9_\-+/]{20,}/)) {
      await ctx.reply("❌ Invalid TON address format.", {
        reply_markup: backToMenuKeyboard(),
      });
      return;
    }

    queries.addAgent(userId, address, name);
    stream.subscribe([address]);

    await sendOrEdit(
      ctx,
      formatWatchSuccess(name, address),
      new InlineKeyboard()
        .text("📊 View Status", `agent:status:${address}`)
        .row()
        .text("🏠 Menu", "menu:main")
    );
  });

  // ── /unwatch ─────────────────────────────────────
  bot.command("unwatch", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const args = ctx.message?.text?.split(/\s+/).slice(1) || [];
    if (args.length < 1) {
      // Show agent list to pick
      const agents = queries.getAgentsByUser(userId);
      if (agents.length === 0) {
        await ctx.reply("No agents to remove.", {
          reply_markup: backToMenuKeyboard(),
        });
        return;
      }
      const kb = new InlineKeyboard();
      for (const a of agents) {
        kb.text(
          `🗑 ${a.name}`,
          `agent:unwatch:${a.address}`
        ).row();
      }
      kb.text("❌ Cancel", "menu:main");
      await ctx.reply("<b>Select agent to remove:</b>", {
        parse_mode: "HTML",
        reply_markup: kb,
      });
      return;
    }

    const address = args[0];
    const agent = queries.getAgent(userId, address);
    const removed = queries.removeAgent(userId, address);

    if (removed) {
      const others = queries.getUsersWatchingAddress(address);
      if (others.length === 0) stream.unsubscribe([address]);
      await sendOrEdit(
        ctx,
        formatUnwatchSuccess(agent?.name || "Agent", address),
        backToMenuKeyboard()
      );
    } else {
      await ctx.reply("Agent not found.", { reply_markup: backToMenuKeyboard() });
    }
  });

  // ── /list ────────────────────────────────────────
  bot.command("list", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const agents = queries.getAgentsByUser(userId);
    await sendOrEdit(ctx, formatAgentList(agents), agentListKeyboard(agents));
  });

  // ── /dashboard ───────────────────────────────────
  bot.command("dashboard", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const agents = queries.getAgentsByUser(userId);
    const stats = new Map<string, { count: number; volume: string }>();
    for (const a of agents) stats.set(a.address, queries.getTodayStats(a.address));
    await sendOrEdit(ctx, formatDashboard(agents, stats), dashboardKeyboard(agents));
  });

  // ── /status ──────────────────────────────────────
  bot.command("status", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const args = ctx.message?.text?.split(/\s+/).slice(1) || [];
    if (args.length < 1) {
      const agents = queries.getAgentsByUser(userId);
      const kb = new InlineKeyboard();
      for (const a of agents) {
        kb.text(a.name, `agent:status:${a.address}`).row();
      }
      kb.text("◀️ Menu", "menu:main");
      await ctx.reply("<b>Select agent:</b>", {
        parse_mode: "HTML",
        reply_markup: kb,
      });
      return;
    }
    const agent = queries.getAgent(userId, args[0]);
    if (!agent) {
      await ctx.reply("Agent not found.", { reply_markup: backToMenuKeyboard() });
      return;
    }
    const stats = queries.getTodayStats(agent.address);
    const txns = queries.getTransactions(agent.address, 5);
    await sendOrEdit(ctx, formatStatus(agent, stats, txns), agentDetailKeyboard(agent.address));
  });

  // ── /alerts ──────────────────────────────────────
  bot.command("alerts", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const agents = queries.getAgentsByUser(userId);
    if (agents.length === 0) {
      await ctx.reply("Add an agent first to configure alerts.", {
        reply_markup: new InlineKeyboard().text("➕ Add Agent", "menu:watch"),
      });
      return;
    }
    queries.ensureAlertSettings(userId);
    const settings = queries.getAlertSettings(userId);
    await sendOrEdit(
      ctx,
      (await import("./formatters.js")).formatAlertSettings(settings),
      buildAlertKeyboard(settings)
    );
  });

  // ── /history ─────────────────────────────────────
  bot.command("history", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const args = ctx.message?.text?.split(/\s+/).slice(1) || [];
    if (args.length < 1) {
      const agents = queries.getAgentsByUser(userId);
      const kb = new InlineKeyboard();
      for (const a of agents) {
        kb.text(`📜 ${a.name}`, `agent:history:${a.address}`).row();
      }
      kb.text("◀️ Menu", "menu:main");
      await ctx.reply("<b>Select agent:</b>", {
        parse_mode: "HTML",
        reply_markup: kb,
      });
      return;
    }
    const agent = queries.getAgent(userId, args[0]);
    if (!agent) {
      await ctx.reply("Agent not found.", { reply_markup: backToMenuKeyboard() });
      return;
    }
    const txns = queries.getTransactions(agent.address, 20);
    await sendOrEdit(
      ctx,
      formatHistory(agent.name, txns),
      backToAgentKeyboard(agent.address)
    );
  });

  // ═══════════════════════════════════════════════════
  // CALLBACK QUERY HANDLERS (inline buttons)
  // ═══════════════════════════════════════════════════

  // ── Main menu ────────────────────────────────────
  bot.callbackQuery("menu:main", async (ctx) => {
    await sendOrEdit(ctx, formatStart(), mainMenuKeyboard());
    await ctx.answerCallbackQuery();
  });

  // ── Dashboard ────────────────────────────────────
  bot.callbackQuery("menu:dashboard", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const agents = queries.getAgentsByUser(userId);
    const stats = new Map<string, { count: number; volume: string }>();
    for (const a of agents) stats.set(a.address, queries.getTodayStats(a.address));
    await sendOrEdit(ctx, formatDashboard(agents, stats), dashboardKeyboard(agents));
    await ctx.answerCallbackQuery();
  });

  // ── Agent list ───────────────────────────────────
  bot.callbackQuery("menu:agents", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const agents = queries.getAgentsByUser(userId);
    await sendOrEdit(ctx, formatAgentList(agents), agentListKeyboard(agents));
    await ctx.answerCallbackQuery();
  });

  // ── Add agent prompt ─────────────────────────────
  bot.callbackQuery("menu:watch", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    waitingForAddress.set(userId, { state: "address" });
    await sendOrEdit(
      ctx,
      [
        `➕ <b>Add Agent</b>`,
        ``,
        `Send me the TON address:`,
        ``,
        `<i>Example: EQBCVd...v_br</i>`,
      ].join("\n"),
      new InlineKeyboard().text("❌ Cancel", "menu:main")
    );
    await ctx.answerCallbackQuery();
  });

  // ── Alerts ───────────────────────────────────────
  bot.callbackQuery("menu:alerts", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const agents = queries.getAgentsByUser(userId);
    if (agents.length === 0) {
      await sendOrEdit(
        ctx,
        "Add an agent first to configure alerts.",
        new InlineKeyboard()
          .text("➕ Add Agent", "menu:watch")
          .row()
          .text("◀️ Menu", "menu:main")
      );
      await ctx.answerCallbackQuery();
      return;
    }
    queries.ensureAlertSettings(userId);
    const settings = queries.getAlertSettings(userId);
    const { formatAlertSettings } = await import("./formatters.js");
    await sendOrEdit(ctx, formatAlertSettings(settings), buildAlertKeyboard(settings));
    await ctx.answerCallbackQuery();
  });

  // ── Toggle alert ─────────────────────────────────
  bot.callbackQuery(/^toggle_alert:(.+)$/, async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const alertType = ctx.match[1];
    const { text, keyboard } = handleAlertCallback(queries, userId, alertType);
    await sendOrEdit(ctx, text, keyboard);
    await ctx.answerCallbackQuery();
  });

  // ── Agent status ─────────────────────────────────
  bot.callbackQuery(/^agent:status:(.+)$/, async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const address = ctx.match[1];
    const agent = queries.getAgent(userId, address);
    if (!agent) {
      await ctx.answerCallbackQuery({ text: "Agent not found" });
      return;
    }
    const stats = queries.getTodayStats(address);
    const txns = queries.getTransactions(address, 5);
    await sendOrEdit(ctx, formatStatus(agent, stats, txns), agentDetailKeyboard(address));
    await ctx.answerCallbackQuery();
  });

  // ── Agent history ────────────────────────────────
  bot.callbackQuery(/^agent:history:(.+)$/, async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const address = ctx.match[1];
    const agent = queries.getAgent(userId, address);
    if (!agent) {
      await ctx.answerCallbackQuery({ text: "Agent not found" });
      return;
    }
    const txns = queries.getTransactions(address, 20);
    await sendOrEdit(ctx, formatHistory(agent.name, txns), backToAgentKeyboard(address));
    await ctx.answerCallbackQuery();
  });

  // ── Unwatch — confirmation step ──────────────────
  bot.callbackQuery(/^agent:unwatch:(.+)$/, async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const address = ctx.match[1];
    const agent = queries.getAgent(userId, address);
    const name = agent?.name || shortAddress(address);

    await sendOrEdit(
      ctx,
      [
        `🗑 <b>Remove Agent?</b>`,
        ``,
        `<b>${name}</b>`,
        `<code>${shortAddress(address)}</code>`,
        ``,
        `You will stop receiving alerts for this agent.`,
      ].join("\n"),
      unwatchConfirmKeyboard(address)
    );
    await ctx.answerCallbackQuery();
  });

  // ── Unwatch — confirmed ──────────────────────────
  bot.callbackQuery(/^agent:unwatch_confirm:(.+)$/, async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const address = ctx.match[1];
    const agent = queries.getAgent(userId, address);
    const name = agent?.name || "Agent";
    const removed = queries.removeAgent(userId, address);
    if (removed) {
      const others = queries.getUsersWatchingAddress(address);
      if (others.length === 0) stream.unsubscribe([address]);
    }
    await sendOrEdit(ctx, formatUnwatchSuccess(name, address), backToMenuKeyboard());
    await ctx.answerCallbackQuery({ text: "Agent removed" });
  });

  // ═══════════════════════════════════════════════════
  // TEXT HANDLER — for interactive /watch flow
  // ═══════════════════════════════════════════════════

  bot.on("message:text", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const waiting = waitingForAddress.get(userId);
    if (!waiting) return; // Not in any flow

    const text = ctx.message.text.trim();

    // Skip if it looks like a command
    if (text.startsWith("/")) return;

    if (waiting.state === "address") {
      if (!text.match(/^(EQ|UQ|0:)[A-Za-z0-9_\-+/]{20,}/)) {
        await ctx.reply(
          [
            `❌ <b>Invalid address format</b>`,
            ``,
            `TON addresses start with <code>EQ</code>, <code>UQ</code>, or <code>0:</code>`,
            ``,
            `Try again or tap Cancel.`,
          ].join("\n"),
          {
            parse_mode: "HTML",
            reply_markup: new InlineKeyboard().text("❌ Cancel", "menu:main"),
          }
        );
        return;
      }

      waitingForAddress.set(userId, { state: "name", address: text });
      await ctx.reply(
        [
          `✅ Address received`,
          `<code>${shortAddress(text)}</code>`,
          ``,
          `Now send me a <b>name</b> for this agent:`,
          ``,
          `<i>Example: Translation Agent</i>`,
        ].join("\n"),
        {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard().text("❌ Cancel", "menu:main"),
        }
      );
      return;
    }

    if (waiting.state === "name" && waiting.address) {
      const address = waiting.address;
      const name = text;

      waitingForAddress.delete(userId);

      queries.addAgent(userId, address, name);
      stream.subscribe([address]);

      await ctx.reply(formatWatchSuccess(name, address), {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard()
          .text("📊 View Status", `agent:status:${address}`)
          .row()
          .text("🏠 Menu", "menu:main"),
      });
    }
  });
}
