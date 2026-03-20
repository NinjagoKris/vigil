import type { Agent, Transaction } from "../db/queries.js";
import type { Alert } from "../monitor/rules.js";

export function nanoToTon(nano: string): number {
  return Number(BigInt(nano)) / 1e9;
}

export function formatTon(nano: string): string {
  const val = nanoToTon(nano);
  if (val === 0) return "0";
  if (val < 0.001) return val.toFixed(6);
  if (val < 1) return val.toFixed(4);
  return val.toFixed(2);
}

export function shortAddress(address: string): string {
  if (address.length <= 14) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function timeAgo(timestamp: number | null): string {
  if (!timestamp) return "never";
  const diff = Math.floor(Date.now() / 1000) - timestamp;
  if (diff < 0) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function balanceBar(balance: number): string {
  if (balance >= 5) return "🟢🟢🟢🟢🟢";
  if (balance >= 2) return "🟢🟢🟢🟢⚪";
  if (balance >= 1) return "🟢🟢🟢⚪⚪";
  if (balance >= 0.3) return "🟡🟡⚪⚪⚪";
  if (balance >= 0.05) return "🟠⚪⚪⚪⚪";
  return "🔴⚪⚪⚪⚪";
}

function statusEmoji(agent: Agent): string {
  const balance = nanoToTon(agent.balance_nano);
  const isInactive =
    agent.last_active && Date.now() / 1000 - agent.last_active > 86400;
  if (balance < 0.05 && isInactive) return "🔴";
  if (balance < 0.05) return "🟠";
  if (isInactive) return "💤";
  return "🟢";
}

// ─── START ───────────────────────────────────────────

export function formatStart(): string {
  return [
    `🛡 <b>Vigil</b>`,
    `<i>Never sleep on your agents</i>`,
    ``,
    `Real-time monitoring of AI agents`,
    `on the TON blockchain.`,
    ``,
    `👇 Use the menu below to get started.`,
    `Add your first agent to begin monitoring.`,
  ].join("\n");
}

// ─── DASHBOARD ───────────────────────────────────────

export function formatDashboard(
  agents: Agent[],
  stats: Map<string, { count: number; volume: string }>
): string {
  if (agents.length === 0) {
    return [
      `🛡 <b>Vigil Dashboard</b>`,
      ``,
      `<i>No agents being monitored yet.</i>`,
      ``,
      `Tap <b>➕ Add Agent</b> to start.`,
    ].join("\n");
  }

  const lines: string[] = [
    `🛡 <b>Vigil Dashboard</b>`,
    `<i>${agents.length} agent${agents.length > 1 ? "s" : ""} monitored</i>`,
    ``,
  ];

  for (const agent of agents) {
    const balance = nanoToTon(agent.balance_nano);
    const stat = stats.get(agent.address) || { count: 0, volume: "0" };
    const emoji = statusEmoji(agent);
    const bar = balanceBar(balance);

    lines.push(`${emoji} <b>${agent.name}</b>`);
    lines.push(`${bar}  <b>${formatTon(agent.balance_nano)}</b> TON`);
    lines.push(
      `📊 ${stat.count} txns  ·  💎 ${formatTon(stat.volume)} vol  ·  🕐 ${timeAgo(agent.last_active)}`
    );
    lines.push(``);
  }

  return lines.join("\n");
}

// ─── AGENT LIST ──────────────────────────────────────

export function formatAgentList(agents: Agent[]): string {
  if (agents.length === 0) {
    return [
      `📋 <b>My Agents</b>`,
      ``,
      `<i>No agents yet.</i>`,
      `Tap <b>➕ Add Agent</b> below.`,
    ].join("\n");
  }

  const lines: string[] = [
    `📋 <b>My Agents</b>  <i>(${agents.length})</i>`,
    ``,
  ];

  for (const agent of agents) {
    const emoji = statusEmoji(agent);
    lines.push(
      `${emoji} <b>${agent.name}</b>  —  <b>${formatTon(agent.balance_nano)}</b> TON`
    );
  }

  lines.push(``);
  lines.push(`<i>Tap an agent for details</i>`);

  return lines.join("\n");
}

// ─── AGENT STATUS ────────────────────────────────────

export function formatStatus(
  agent: Agent,
  stats: { count: number; volume: string },
  recentTxns: Transaction[]
): string {
  const balance = nanoToTon(agent.balance_nano);
  const emoji = statusEmoji(agent);
  const bar = balanceBar(balance);

  const lines: string[] = [
    `${emoji} <b>${agent.name}</b>`,
    ``,
    `<code>${agent.address}</code>`,
    ``,
    `💰 <b>Balance</b>`,
    `${bar}  <b>${formatTon(agent.balance_nano)}</b> TON`,
    ``,
    `📊 <b>Today</b>`,
    `Transactions: <b>${stats.count}</b>`,
    `Volume: <b>${formatTon(stats.volume)}</b> TON`,
    ``,
    `🕐 Last active: <b>${timeAgo(agent.last_active)}</b>`,
    `📅 Monitored since: ${new Date(agent.added_at * 1000).toLocaleDateString()}`,
  ];

  if (recentTxns.length > 0) {
    lines.push(``);
    lines.push(`📜 <b>Recent Transactions</b>`);
    lines.push(``);
    for (const tx of recentTxns.slice(0, 5)) {
      const dir = tx.direction === "in" ? "📥" : "📤";
      const amount = formatTon(tx.amount_nano);
      const cp = tx.counterparty ? shortAddress(tx.counterparty) : "—";
      lines.push(
        `${dir} <b>${amount}</b> TON  →  <code>${cp}</code>  <i>${timeAgo(tx.timestamp)}</i>`
      );
    }
  }

  return lines.join("\n");
}

// ─── TRANSACTION HISTORY ─────────────────────────────

export function formatHistory(
  agentName: string,
  transactions: Transaction[]
): string {
  if (transactions.length === 0) {
    return [
      `📜 <b>${agentName}</b>`,
      ``,
      `<i>No transactions recorded yet.</i>`,
    ].join("\n");
  }

  const lines: string[] = [
    `📜 <b>${agentName}</b>  —  Transaction History`,
    ``,
  ];

  for (const tx of transactions) {
    const dir = tx.direction === "in" ? "📥" : "📤";
    const amount = formatTon(tx.amount_nano);
    const cp = tx.counterparty ? shortAddress(tx.counterparty) : "—";
    const time = new Date(tx.timestamp * 1000).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
    lines.push(
      `${dir} <b>${amount}</b> TON  ·  <code>${cp}</code>  ·  <i>${time}</i>`
    );
  }

  return lines.join("\n");
}

// ─── ALERTS ──────────────────────────────────────────

export function formatAlert(alert: Alert): string {
  const icons: Record<string, string> = {
    low_balance: "🪫",
    large_tx: "💸",
    inactive: "💤",
    high_frequency: "⚡",
    new_contract: "🆕",
    balance_drop: "📉",
  };
  const icon = icons[alert.type] || (alert.severity === "critical" ? "🔴" : "⚠️");

  const severityTag =
    alert.severity === "critical" ? "🔴 CRITICAL" : "⚠️ WARNING";

  return [
    `${icon} <b>ALERT</b>  ·  ${severityTag}`,
    ``,
    `<b>${alert.agentName}</b>`,
    `<code>${shortAddress(alert.address)}</code>`,
    ``,
    `${alert.message}`,
  ].join("\n");
}

export function formatAlertSettings(
  settings: Array<{
    alert_type: string;
    enabled: number;
    threshold: string | null;
  }>
): string {
  const labels: Record<string, { name: string; icon: string; unit: string }> = {
    low_balance: { name: "Low Balance", icon: "🪫", unit: "TON" },
    large_tx: { name: "Large TX", icon: "💸", unit: "TON" },
    inactive: { name: "Inactive", icon: "💤", unit: "hours" },
    high_frequency: { name: "High Frequency", icon: "⚡", unit: "txns/h" },
    new_contract: { name: "New Contract", icon: "🆕", unit: "" },
    balance_drop: { name: "Balance Drop", icon: "📉", unit: "%" },
  };

  const lines: string[] = [
    `🔔 <b>Alert Settings</b>`,
    ``,
    `<i>Tap buttons to toggle on/off:</i>`,
    ``,
  ];

  for (const s of settings) {
    const label = labels[s.alert_type] || {
      name: s.alert_type,
      icon: "🔔",
      unit: "",
    };
    const status = s.enabled ? "✅ ON " : "❌ OFF";
    let threshold = "";
    if (s.threshold && label.unit) {
      if (s.alert_type === "low_balance" || s.alert_type === "large_tx") {
        threshold = `  ·  ${formatTon(s.threshold)} ${label.unit}`;
      } else if (s.alert_type === "inactive") {
        threshold = `  ·  ${parseInt(s.threshold, 10) / 3600}h`;
      } else {
        threshold = `  ·  ${s.threshold} ${label.unit}`;
      }
    }
    lines.push(`${label.icon} ${label.name}:  ${status}${threshold}`);
  }

  return lines.join("\n");
}

// ─── THRESHOLD SUBMENU ───────────────────────────────

const ALERT_META: Record<
  string,
  { name: string; icon: string; unit: string }
> = {
  low_balance: { name: "Low Balance", icon: "🪫", unit: "TON" },
  large_tx: { name: "Large TX", icon: "💸", unit: "TON" },
  inactive: { name: "Inactive", icon: "💤", unit: "hours" },
  high_frequency: { name: "High Frequency", icon: "⚡", unit: "txns/h" },
  new_contract: { name: "New Contract", icon: "🆕", unit: "" },
  balance_drop: { name: "Balance Drop", icon: "📉", unit: "%" },
};

export function formatThresholdValue(
  alertType: string,
  threshold: string | null
): string {
  if (!threshold) return "—";
  if (alertType === "low_balance" || alertType === "large_tx") {
    return `${formatTon(threshold)} TON`;
  }
  if (alertType === "inactive") {
    const hours = parseInt(threshold, 10) / 3600;
    return `${hours}h`;
  }
  if (alertType === "high_frequency") {
    return `${threshold} txns/h`;
  }
  if (alertType === "balance_drop") {
    return `${threshold}%`;
  }
  return threshold;
}

export function formatThresholdSubmenu(
  alertType: string,
  setting: { enabled: number; threshold: string | null }
): string {
  const meta = ALERT_META[alertType] || {
    name: alertType,
    icon: "🔔",
    unit: "",
  };
  const status = setting.enabled ? "✅ ON" : "❌ OFF";
  const thresholdDisplay = formatThresholdValue(alertType, setting.threshold);

  const lines: string[] = [
    `${meta.icon} <b>${meta.name}</b>`,
    ``,
    `Status: ${status}`,
  ];

  if (alertType !== "new_contract") {
    lines.push(`Current threshold: <b>${thresholdDisplay}</b>`);
    lines.push(``);
    lines.push(`<i>Choose a new threshold:</i>`);
  }

  return lines.join("\n");
}

// ─── WATCH CONFIRMATIONS ─────────────────────────────

export function formatWatchSuccess(name: string, address: string): string {
  return [
    `✅ <b>Agent Added</b>`,
    ``,
    `<b>${name}</b>`,
    `<code>${address}</code>`,
    ``,
    `Now monitoring in real-time.`,
    `You'll receive alerts for this agent.`,
  ].join("\n");
}

export function formatUnwatchSuccess(name: string, address: string): string {
  return [
    `🗑 <b>Agent Removed</b>`,
    ``,
    `<b>${name}</b>`,
    `<code>${shortAddress(address)}</code>`,
    ``,
    `Monitoring stopped.`,
  ].join("\n");
}
