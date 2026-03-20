import { InlineKeyboard } from "grammy";
import type { Queries } from "../db/queries.js";
import { formatAlertSettings } from "./formatters.js";

const ALERT_TYPES: Array<{
  type: string;
  label: string;
  icon: string;
}> = [
  { type: "low_balance", label: "Low Balance", icon: "🪫" },
  { type: "large_tx", label: "Large TX", icon: "💸" },
  { type: "inactive", label: "Inactive", icon: "💤" },
  { type: "high_frequency", label: "High Freq", icon: "⚡" },
  { type: "new_contract", label: "New Contract", icon: "🆕" },
  { type: "balance_drop", label: "Balance Drop", icon: "📉" },
];

export function buildAlertKeyboard(
  settings: Array<{ alert_type: string; enabled: number }>
): InlineKeyboard {
  const kb = new InlineKeyboard();

  for (let i = 0; i < ALERT_TYPES.length; i++) {
    const at = ALERT_TYPES[i];
    const setting = settings.find((s) => s.alert_type === at.type);
    const isOn = setting?.enabled ?? 1;
    const toggle = isOn ? "✅" : "❌";
    kb.text(`${toggle} ${at.icon} ${at.label}`, `toggle_alert:${at.type}`);
    if (i % 2 === 1) kb.row();
  }

  kb.row();
  kb.text("◀️ Back to Menu", "m:main");

  return kb;
}

export function handleAlertCallback(
  queries: Queries,
  userId: number,
  alertType: string
): { text: string; keyboard: InlineKeyboard } {
  queries.toggleAlert(userId, alertType);
  const settings = queries.getAlertSettings(userId);
  return {
    text: formatAlertSettings(settings),
    keyboard: buildAlertKeyboard(settings),
  };
}
