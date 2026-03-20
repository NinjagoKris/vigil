import { InlineKeyboard } from "grammy";
import type { Queries } from "../db/queries.js";
import { formatAlertSettings } from "./formatters.js";

const ALERT_TYPE_LABELS: Record<string, string> = {
  low_balance: "Low Balance",
  large_tx: "Large TX",
  inactive: "Inactive",
  high_frequency: "High Freq",
  new_contract: "New Contract",
  balance_drop: "Balance Drop",
};

export function buildAlertKeyboard(
  settings: Array<{
    alert_type: string;
    enabled: number;
  }>
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  for (let i = 0; i < settings.length; i++) {
    const s = settings[i];
    const label = ALERT_TYPE_LABELS[s.alert_type] || s.alert_type;
    const icon = s.enabled ? "✅" : "❌";
    keyboard.text(`${icon} ${label}`, `toggle_alert:${s.alert_type}`);
    if (i % 2 === 1) keyboard.row();
  }

  return keyboard;
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
