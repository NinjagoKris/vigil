import { Bot, InlineKeyboard, type Context } from "grammy";
import type { Queries } from "../db/queries.js";
import type { ToncenterStream } from "../monitor/stream.js";
import { getAccountInfo } from "../ton/client.js";
import {
  formatStart,
  formatDashboard,
  formatAgentList,
  formatStatus,
  formatHistory,
  formatWatchSuccess,
  formatUnwatchSuccess,
  formatThresholdSubmenu,
  shortAddress,
} from "./formatters.js";
import {
  buildAlertKeyboard,
  buildThresholdKeyboard,
  handleAlertCallback,
  handleThresholdSet,
} from "./alerts.js";

// ─── KEYBOARD BUILDERS ──────────────────────────────
// Short prefixes to stay under Telegram's 64-byte callback_data limit

function mainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📊 Dashboard", "m:dash")
    .text("📋 My Agents", "m:list")
    .row()
    .text("➕ Add Agent", "m:watch")
    .text("🔔 Alerts", "m:alerts")
    .row()
    .text("🔄 Refresh", "m:dash");
}

function agentListKeyboard(
  agents: Array<{ address: string; name: string }>
): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const agent of agents) {
    kb.text(`${agent.name}`, `s:${agent.address}`).row();
  }
  kb.text("➕ Add Agent", "m:watch").row();
  kb.text("◀️ Back to Menu", "m:main");
  return kb;
}

function agentDetailKeyboard(address: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("📜 History", `h:${address}`)
    .text("🔄 Refresh", `s:${address}`)
    .row()
    .text("🗑 Unwatch", `u:${address}`)
    .text("◀️ Back", "m:list");
}

function backToAgentKeyboard(address: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("◀️ Back to Agent", `s:${address}`)
    .text("🏠 Menu", "m:main");
}

function backToMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("🏠 Back to Menu", "m:main");
}

function dashboardKeyboard(
  agents: Array<{ address: string; name: string }>
): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const agent of agents) {
    kb.text(`📍 ${agent.name}`, `s:${agent.address}`).row();
  }
  kb.text("🔄 Refresh", "m:dash")
    .text("➕ Add", "m:watch")
    .row();
  kb.text("◀️ Menu", "m:main");
  return kb;
}

function unwatchConfirmKeyboard(address: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Yes, remove", `uc:${address}`)
    .text("❌ Cancel", `s:${address}`);
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

async function addAgentWithBalance(
  queries: Queries,
  stream: ToncenterStream,
  userId: number,
  address: string,
  name: string
): Promise<void> {
  // Fetch initial balance + last_activity + raw_address
  let rawAddress: string | undefined;
  try {
    const info = await getAccountInfo(address);
    rawAddress = info.raw_address || undefined;
    queries.addAgent(userId, address, name, rawAddress);
    stream.subscribe([address]);
    queries.updateBalance(address, info.balance);
    if (info.last_activity) {
      queries.updateLastActive(address, info.last_activity);
    }
  } catch (err) {
    // If API call fails, still add the agent without raw_address
    queries.addAgent(userId, address, name);
    stream.subscribe([address]);
    console.error(`[Watch] Failed to fetch initial balance for ${address}:`, err);
  }
}

const MAX_AGENTS_PER_USER = 10;

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

    if (queries.getAgentCount(userId) >= MAX_AGENTS_PER_USER) {
      await ctx.reply("You can monitor up to 10 agents.", {
        reply_markup: backToMenuKeyboard(),
      });
      return;
    }

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
          reply_markup: new InlineKeyboard().text("❌ Cancel", "m:main"),
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

    // Check if it's a wallet
    try {
      const info = await getAccountInfo(address);
      if (!info.is_wallet) {
        await ctx.reply(
          [
            `⚠️ <b>Warning:</b> This address doesn't look like a wallet.`,
            `It may be an exchange, pool, or contract with very high traffic.`,
            ``,
            `Are you sure you want to monitor it?`,
          ].join("\n"),
          {
            parse_mode: "HTML",
            reply_markup: new InlineKeyboard()
              .text("✅ Add anyway", `fw:${address}:${name}`)
              .text("❌ Cancel", "m:main"),
          }
        );
        return;
      }
    } catch {
      // If check fails, allow adding anyway
    }

    await addAgentWithBalance(queries, stream, userId, address, name);

    await sendOrEdit(
      ctx,
      formatWatchSuccess(name, address),
      new InlineKeyboard()
        .text("📊 View Status", `s:${address}`)
        .row()
        .text("🏠 Menu", "m:main")
    );
  });

  // ── /unwatch ─────────────────────────────────────
  bot.command("unwatch", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const args = ctx.message?.text?.split(/\s+/).slice(1) || [];
    if (args.length < 1) {
      const agents = queries.getAgentsByUser(userId);
      if (agents.length === 0) {
        await ctx.reply("No agents to remove.", {
          reply_markup: backToMenuKeyboard(),
        });
        return;
      }
      const kb = new InlineKeyboard();
      for (const a of agents) {
        kb.text(`🗑 ${a.name}`, `u:${a.address}`).row();
      }
      kb.text("❌ Cancel", "m:main");
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
        kb.text(a.name, `s:${a.address}`).row();
      }
      kb.text("◀️ Menu", "m:main");
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
        reply_markup: new InlineKeyboard().text("➕ Add Agent", "m:watch"),
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
        kb.text(`📜 ${a.name}`, `h:${a.address}`).row();
      }
      kb.text("◀️ Menu", "m:main");
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
  // CALLBACK QUERY HANDLERS
  // ═══════════════════════════════════════════════════

  bot.callbackQuery("m:main", async (ctx) => {
    await sendOrEdit(ctx, formatStart(), mainMenuKeyboard());
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("m:dash", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const agents = queries.getAgentsByUser(userId);
    const stats = new Map<string, { count: number; volume: string }>();
    for (const a of agents) stats.set(a.address, queries.getTodayStats(a.address));
    await sendOrEdit(ctx, formatDashboard(agents, stats), dashboardKeyboard(agents));
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("m:list", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const agents = queries.getAgentsByUser(userId);
    await sendOrEdit(ctx, formatAgentList(agents), agentListKeyboard(agents));
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("m:watch", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    if (queries.getAgentCount(userId) >= MAX_AGENTS_PER_USER) {
      await sendOrEdit(ctx, "You can monitor up to 10 agents.", backToMenuKeyboard());
      await ctx.answerCallbackQuery();
      return;
    }

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
      new InlineKeyboard().text("❌ Cancel", "m:main")
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("m:alerts", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const agents = queries.getAgentsByUser(userId);
    if (agents.length === 0) {
      await sendOrEdit(
        ctx,
        "Add an agent first to configure alerts.",
        new InlineKeyboard()
          .text("➕ Add Agent", "m:watch")
          .row()
          .text("◀️ Menu", "m:main")
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

  // ── Threshold submenu (ta:ALERTTYPE) ───────────────
  bot.callbackQuery(/^ta:(.+)$/, async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const alertType = ctx.match[1];
    queries.ensureAlertSettings(userId);
    const setting = queries.getAlertSetting(userId, alertType);
    const effectiveSetting = setting || { enabled: 1, threshold: null };
    await sendOrEdit(
      ctx,
      formatThresholdSubmenu(alertType, effectiveSetting),
      buildThresholdKeyboard(alertType, effectiveSetting)
    );
    await ctx.answerCallbackQuery();
  });

  // ── Toggle alert on/off (tt:ALERTTYPE) ────────────
  bot.callbackQuery(/^tt:(.+)$/, async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const alertType = ctx.match[1];
    queries.toggleAlert(userId, alertType);
    const setting = queries.getAlertSetting(userId, alertType);
    const effectiveSetting = setting || { enabled: 1, threshold: null };
    await sendOrEdit(
      ctx,
      formatThresholdSubmenu(alertType, effectiveSetting),
      buildThresholdKeyboard(alertType, effectiveSetting)
    );
    await ctx.answerCallbackQuery();
  });

  // ── Set threshold value (tv:ALERTTYPE:VALUE) ──────
  bot.callbackQuery(/^tv:(.+):(.+)$/, async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const alertType = ctx.match[1];
    const value = ctx.match[2];
    const { text, keyboard } = handleThresholdSet(queries, userId, alertType, value);
    await sendOrEdit(ctx, text, keyboard);
    await ctx.answerCallbackQuery({ text: "Threshold updated" });
  });

  // ── Agent status (s:ADDRESS) ─────────────────────
  bot.callbackQuery(/^s:(.+)$/, async (ctx) => {
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

  // ── Agent history (h:ADDRESS) ────────────────────
  bot.callbackQuery(/^h:(.+)$/, async (ctx) => {
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

  // ── Unwatch step 1 (u:ADDRESS) ───────────────────
  bot.callbackQuery(/^u:(.+)$/, async (ctx) => {
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

  // ── Unwatch confirmed (uc:ADDRESS) ───────────────
  bot.callbackQuery(/^uc:(.+)$/, async (ctx) => {
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

  // ── Force watch non-wallet (fw:ADDRESS:NAME) ─────
  bot.callbackQuery(/^fw:(.+):(.+)$/, async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    if (queries.getAgentCount(userId) >= MAX_AGENTS_PER_USER) {
      await sendOrEdit(ctx, "You can monitor up to 10 agents.", backToMenuKeyboard());
      await ctx.answerCallbackQuery();
      return;
    }

    const address = ctx.match[1];
    const name = ctx.match[2];

    await addAgentWithBalance(queries, stream, userId, address, name);

    await sendOrEdit(
      ctx,
      formatWatchSuccess(name, address),
      new InlineKeyboard()
        .text("📊 View Status", `s:${address}`)
        .row()
        .text("🏠 Menu", "m:main")
    );
    await ctx.answerCallbackQuery();
  });

  // ═══════════════════════════════════════════════════
  // TEXT HANDLER — for interactive /watch flow
  // ═══════════════════════════════════════════════════

  bot.on("message:text", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const waiting = waitingForAddress.get(userId);
    if (!waiting) return;

    const text = ctx.message.text.trim();
    if (text.startsWith("/")) return;

    if (waiting.state === "address") {
      if (queries.getAgentCount(userId) >= MAX_AGENTS_PER_USER) {
        waitingForAddress.delete(userId);
        await ctx.reply("You can monitor up to 10 agents.", {
          reply_markup: backToMenuKeyboard(),
        });
        return;
      }

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
            reply_markup: new InlineKeyboard().text("❌ Cancel", "m:main"),
          }
        );
        return;
      }

      // Check if it's a wallet
      try {
        const info = await getAccountInfo(text);
        if (!info.is_wallet) {
          waitingForAddress.delete(userId);
          await ctx.reply(
            [
              `⚠️ <b>Warning:</b> This doesn't look like a wallet.`,
              `It may be an exchange or contract with high traffic.`,
              ``,
              `Send a wallet address, or tap Add anyway.`,
            ].join("\n"),
            {
              parse_mode: "HTML",
              reply_markup: new InlineKeyboard()
                .text("✅ Add anyway", `fwa:${text}`)
                .text("❌ Cancel", "m:main"),
            }
          );
          return;
        }
      } catch {
        // If check fails, continue
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
          reply_markup: new InlineKeyboard().text("❌ Cancel", "m:main"),
        }
      );
      return;
    }

    if (waiting.state === "name" && waiting.address) {
      const address = waiting.address;
      const name = text;

      waitingForAddress.delete(userId);

      await addAgentWithBalance(queries, stream, userId, address, name);

      await ctx.reply(formatWatchSuccess(name, address), {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard()
          .text("📊 View Status", `s:${address}`)
          .row()
          .text("🏠 Menu", "m:main"),
      });
    }
  });

  // ── Force watch from interactive flow (fwa:ADDRESS) ──
  bot.callbackQuery(/^fwa:(.+)$/, async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    if (queries.getAgentCount(userId) >= MAX_AGENTS_PER_USER) {
      await sendOrEdit(ctx, "You can monitor up to 10 agents.", backToMenuKeyboard());
      await ctx.answerCallbackQuery();
      return;
    }

    const address = ctx.match[1];
    waitingForAddress.set(userId, { state: "name", address });
    await sendOrEdit(
      ctx,
      [
        `✅ Address accepted`,
        `<code>${shortAddress(address)}</code>`,
        ``,
        `Now send me a <b>name</b> for this agent:`,
      ].join("\n"),
      new InlineKeyboard().text("❌ Cancel", "m:main")
    );
    await ctx.answerCallbackQuery();
  });
}
