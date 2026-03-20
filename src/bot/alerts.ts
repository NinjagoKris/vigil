import { InlineKeyboard } from "grammy";
import type { Queries, AlertSetting } from "../db/queries.js";
import {
  formatAlertSettings,
  formatThresholdSubmenu,
  formatThresholdValue,
} from "./formatters.js";

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

// Preset values per alert type
// low_balance & large_tx: stored as nanoton (string)
// inactive: stored as seconds (string)
// high_frequency: stored as count (string)
// balance_drop: stored as percent (string)
const PRESETS: Record<string, Array<{ label: string; value: string }>> = {
  low_balance: [
    { label: "0.01 TON", value: "10000000" },
    { label: "0.05 TON", value: "50000000" },
    { label: "0.1 TON", value: "100000000" },
    { label: "0.5 TON", value: "500000000" },
    { label: "1.0 TON", value: "1000000000" },
  ],
  large_tx: [
    { label: "0.5 TON", value: "500000000" },
    { label: "1 TON", value: "1000000000" },
    { label: "5 TON", value: "5000000000" },
    { label: "10 TON", value: "10000000000" },
    { label: "50 TON", value: "50000000000" },
  ],
  inactive: [
    { label: "1h", value: "3600" },
    { label: "6h", value: "21600" },
    { label: "12h", value: "43200" },
    { label: "24h", value: "86400" },
    { label: "48h", value: "172800" },
  ],
  high_frequency: [
    { label: "10", value: "10" },
    { label: "25", value: "25" },
    { label: "50", value: "50" },
    { label: "100", value: "100" },
    { label: "200", value: "200" },
  ],
  balance_drop: [
    { label: "20%", value: "20" },
    { label: "30%", value: "30" },
    { label: "50%", value: "50" },
    { label: "70%", value: "70" },
    { label: "90%", value: "90" },
  ],
};

export function buildAlertKeyboard(
  settings: Array<{ alert_type: string; enabled: number }>
): InlineKeyboard {
  const kb = new InlineKeyboard();

  for (let i = 0; i < ALERT_TYPES.length; i++) {
    const at = ALERT_TYPES[i];
    const setting = settings.find((s) => s.alert_type === at.type);
    const isOn = setting?.enabled ?? 1;
    const toggle = isOn ? "✅" : "❌";
    kb.text(`${toggle} ${at.icon} ${at.label}`, `ta:${at.type}`);
    if (i % 2 === 1) kb.row();
  }

  kb.row();
  kb.text("◀️ Back to Menu", "m:main");

  return kb;
}

export function buildThresholdKeyboard(
  alertType: string,
  currentSetting: { enabled: number; threshold: string | null }
): InlineKeyboard {
  const kb = new InlineKeyboard();

  // Toggle on/off button
  const toggleLabel = currentSetting.enabled ? "❌ Turn OFF" : "✅ Turn ON";
  kb.text(toggleLabel, `tt:${alertType}`).row();

  // Preset value buttons (if this alert type has presets)
  const presets = PRESETS[alertType];
  if (presets) {
    for (let i = 0; i < presets.length; i++) {
      const p = presets[i];
      const isCurrent = currentSetting.threshold === p.value;
      const marker = isCurrent ? "• " : "";
      kb.text(`${marker}${p.label}`, `tv:${alertType}:${p.value}`);
      // 3 buttons per row for readability
      if (i % 3 === 2) kb.row();
    }
    // Ensure we end the row if not already ended
    if (presets.length % 3 !== 0) kb.row();
  }

  // Back button
  kb.text("◀️ Back to Alerts", "m:alerts");

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

export function handleThresholdSet(
  queries: Queries,
  userId: number,
  alertType: string,
  value: string
): { text: string; keyboard: InlineKeyboard } {
  queries.updateAlertThreshold(userId, alertType, value);
  const setting = queries.getAlertSetting(userId, alertType);
  const effectiveSetting = setting || { enabled: 1, threshold: value };
  return {
    text: formatThresholdSubmenu(alertType, effectiveSetting),
    keyboard: buildThresholdKeyboard(alertType, effectiveSetting),
  };
}
