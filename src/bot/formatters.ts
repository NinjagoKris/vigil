import type { Agent, Transaction } from "../db/queries.js";
import type { Alert } from "../monitor/rules.js";

export function nanoToTon(nano: string): number {
  return Number(BigInt(nano)) / 1e9;
}

export function formatTon(nano: string): string {
  return nanoToTon(nano).toFixed(4);
}

export function shortAddress(address: string): string {
  if (address.length <= 14) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function timeAgo(timestamp: number | null): string {
  if (!timestamp) return "Never";
  const diff = Math.floor(Date.now() / 1000) - timestamp;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  return `${Math.floor(diff / 86400)} days ago`;
}

export function formatStart(): string {
  return `<b>Vigil</b> — Never sleep on your agents

Real-time monitoring of AI agents on TON blockchain.

<b>Commands:</b>
/watch <code>&lt;address&gt; &lt;name&gt;</code> — Add agent to monitor
/unwatch <code>&lt;address&gt;</code> — Remove agent
/list — List your agents with balances
/status <code>&lt;address&gt;</code> — Detailed agent status
/alerts — Configure alert settings
/dashboard — Overview of all agents
/history <code>&lt;address&gt;</code> — Last 20 transactions

<b>Alerts:</b>
Low balance, large transactions, inactivity, high frequency, new contracts, balance drops — all configurable.`;
}

export function formatDashboard(
  agents: Agent[],
  stats: Map<string, { count: number; volume: string }>
): string {
  if (agents.length === 0) {
    return `<b>Vigil Dashboard</b>\n\nNo agents being monitored.\nUse /watch to add one.`;
  }

  let text = `<b>⚡ Vigil Dashboard</b>\n`;

  for (const agent of agents) {
    const balance = nanoToTon(agent.balance_nano);
    const isLow = balance < 0.05;
    const stat = stats.get(agent.address) || { count: 0, volume: "0" };
    const lastActive = timeAgo(agent.last_active);

    const isInactive =
      agent.last_active && Date.now() / 1000 - agent.last_active > 86400;

    let status = "✅ Normal";
    if (isLow) status = "⚠️ Low Balance";
    if (isInactive) status = "⚠️ Inactive";
    if (isLow && isInactive) status = "🔴 Attention";

    text += `\n<b>${agent.name}</b> (<code>${shortAddress(agent.address)}</code>)`;
    text += `\nBalance: ${balance.toFixed(4)} TON${isLow ? " ⚠️ Low" : ""}`;
    text += `\nLast active: ${lastActive}`;
    text += `\nTxns today: ${stat.count} | Volume: ${formatTon(stat.volume)} TON`;
    text += `\nStatus: ${status}\n`;
  }

  return text;
}

export function formatAgentList(agents: Agent[]): string {
  if (agents.length === 0) {
    return "No agents being monitored.\nUse /watch <code>&lt;address&gt; &lt;name&gt;</code> to add one.";
  }

  let text = `<b>Your Agents</b> (${agents.length})\n`;
  for (const agent of agents) {
    const balance = formatTon(agent.balance_nano);
    text += `\n• <b>${agent.name}</b>`;
    text += `\n  <code>${shortAddress(agent.address)}</code>`;
    text += `\n  Balance: ${balance} TON | Last: ${timeAgo(agent.last_active)}`;
  }
  return text;
}

export function formatStatus(
  agent: Agent,
  stats: { count: number; volume: string },
  recentTxns: Transaction[]
): string {
  const balance = nanoToTon(agent.balance_nano);

  let text = `<b>${agent.name}</b>\n`;
  text += `Address: <code>${agent.address}</code>\n`;
  text += `Balance: ${balance.toFixed(4)} TON\n`;
  text += `Last active: ${timeAgo(agent.last_active)}\n`;
  text += `Txns today: ${stats.count} | Volume: ${formatTon(stats.volume)} TON\n`;
  text += `Monitored since: ${new Date(agent.added_at * 1000).toLocaleDateString()}\n`;

  if (recentTxns.length > 0) {
    text += `\n<b>Last 5 transactions:</b>\n`;
    for (const tx of recentTxns.slice(0, 5)) {
      const dir = tx.direction === "in" ? "📥" : "📤";
      const amount = formatTon(tx.amount_nano);
      const cp = tx.counterparty ? shortAddress(tx.counterparty) : "—";
      text += `${dir} ${amount} TON ${tx.direction === "in" ? "from" : "to"} ${cp} (${timeAgo(tx.timestamp)})\n`;
    }
  }

  return text;
}

export function formatHistory(
  agentName: string,
  transactions: Transaction[]
): string {
  if (transactions.length === 0) {
    return `<b>${agentName}</b> — No transactions recorded yet.`;
  }

  let text = `<b>${agentName} — Transaction History</b>\n`;
  for (const tx of transactions) {
    const dir = tx.direction === "in" ? "📥" : "📤";
    const amount = formatTon(tx.amount_nano);
    const cp = tx.counterparty ? shortAddress(tx.counterparty) : "—";
    const time = new Date(tx.timestamp * 1000).toLocaleString();
    text += `\n${dir} ${amount} TON`;
    text += `\n   ${tx.direction === "in" ? "From" : "To"}: <code>${cp}</code>`;
    text += `\n   ${time}`;
  }
  return text;
}

export function formatAlert(alert: Alert): string {
  const icon = alert.severity === "critical" ? "🔴" : "⚠️";
  const typeLabels: Record<string, string> = {
    low_balance: "LOW BALANCE",
    large_tx: "LARGE TRANSACTION",
    inactive: "INACTIVE",
    high_frequency: "HIGH FREQUENCY",
    new_contract: "NEW CONTRACT",
    balance_drop: "BALANCE DROP",
  };

  return `${icon} <b>${typeLabels[alert.type] || alert.type}</b>\n\n<b>${alert.agentName}</b> (<code>${shortAddress(alert.address)}</code>)\n${alert.message}`;
}

export function formatAlertSettings(
  settings: Array<{
    alert_type: string;
    enabled: number;
    threshold: string | null;
  }>
): string {
  const labels: Record<string, { name: string; unit: string }> = {
    low_balance: { name: "Low Balance", unit: "TON" },
    large_tx: { name: "Large Transaction", unit: "TON" },
    inactive: { name: "Inactive", unit: "hours" },
    high_frequency: { name: "High Frequency", unit: "txns/hour" },
    new_contract: { name: "New Contract", unit: "" },
    balance_drop: { name: "Balance Drop", unit: "%" },
  };

  let text = "<b>Alert Settings</b>\n\nTap to toggle on/off:\n";
  for (const s of settings) {
    const label = labels[s.alert_type] || {
      name: s.alert_type,
      unit: "",
    };
    const status = s.enabled ? "✅" : "❌";
    let threshold = "";
    if (s.threshold && label.unit) {
      if (
        s.alert_type === "low_balance" ||
        s.alert_type === "large_tx"
      ) {
        threshold = ` (${formatTon(s.threshold)} ${label.unit})`;
      } else if (s.alert_type === "inactive") {
        const hours = parseInt(s.threshold, 10) / 3600;
        threshold = ` (${hours}h)`;
      } else {
        threshold = ` (${s.threshold} ${label.unit})`;
      }
    }
    text += `\n${status} ${label.name}${threshold}`;
  }

  return text;
}
