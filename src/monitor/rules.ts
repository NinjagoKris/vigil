import type { AlertSetting, Transaction } from "../db/queries.js";
import { toFriendly } from "../ton/client.js";

export interface AlertContext {
  address: string;
  agentName: string;
  balanceNano: string;
  transaction?: Transaction;
  settings: AlertSetting[];
  txCountLastHour: number;
  isNewContract: boolean;
  balanceChangeLastHour: string | null; // net change in nanoton
}

export interface Alert {
  type: string;
  address: string;
  agentName: string;
  message: string;
  severity: "warning" | "critical";
}

function getSetting(
  settings: AlertSetting[],
  type: string
): AlertSetting | undefined {
  return settings.find((s) => s.alert_type === type && s.enabled);
}

export function checkLowBalance(ctx: AlertContext): Alert | null {
  const setting = getSetting(ctx.settings, "low_balance");
  if (!setting) return null;

  const threshold = BigInt(setting.threshold || "50000000");
  const balance = BigInt(ctx.balanceNano);

  if (balance < threshold) {
    const balanceTon = Number(balance) / 1e9;
    const thresholdTon = Number(threshold) / 1e9;
    return {
      type: "low_balance",
      address: ctx.address,
      agentName: ctx.agentName,
      message: `Balance ${balanceTon.toFixed(4)} TON is below threshold ${thresholdTon} TON`,
      severity: balance < threshold / 2n ? "critical" : "warning",
    };
  }
  return null;
}

export function checkLargeTx(ctx: AlertContext): Alert | null {
  const setting = getSetting(ctx.settings, "large_tx");
  if (!setting || !ctx.transaction) return null;

  const threshold = BigInt(setting.threshold || "1000000000");
  const amount = BigInt(ctx.transaction.amount_nano);

  if (amount > threshold) {
    const amountTon = Number(amount) / 1e9;
    const dir = ctx.transaction.direction === "in" ? "Incoming" : "Outgoing";
    return {
      type: "large_tx",
      address: ctx.address,
      agentName: ctx.agentName,
      message: `${dir} transaction of ${amountTon.toFixed(4)} TON`,
      severity: "warning",
    };
  }
  return null;
}

export function checkInactive(ctx: AlertContext): Alert | null {
  const setting = getSetting(ctx.settings, "inactive");
  if (!setting) return null;
  // Inactive check is done on a timer, not per-transaction
  // This is a placeholder that returns null during tx processing
  return null;
}

export function checkHighFrequency(ctx: AlertContext): Alert | null {
  const setting = getSetting(ctx.settings, "high_frequency");
  if (!setting) return null;

  const threshold = parseInt(setting.threshold || "50", 10);

  if (ctx.txCountLastHour > threshold) {
    return {
      type: "high_frequency",
      address: ctx.address,
      agentName: ctx.agentName,
      message: `${ctx.txCountLastHour} transactions in the last hour (threshold: ${threshold})`,
      severity: "warning",
    };
  }
  return null;
}

export function checkNewContract(ctx: AlertContext): Alert | null {
  const setting = getSetting(ctx.settings, "new_contract");
  if (!setting || !ctx.isNewContract || !ctx.transaction?.counterparty)
    return null;

  return {
    type: "new_contract",
    address: ctx.address,
    agentName: ctx.agentName,
    message: `Interaction with new contract:\n<a href="https://tonviewer.com/${toFriendly(ctx.transaction.counterparty)}">${toFriendly(ctx.transaction.counterparty).slice(0, 8)}...${toFriendly(ctx.transaction.counterparty).slice(-6)}</a>`,
    severity: "warning",
  };
}

export function checkBalanceDrop(ctx: AlertContext): Alert | null {
  const setting = getSetting(ctx.settings, "balance_drop");
  if (!setting || !ctx.balanceChangeLastHour) return null;

  const thresholdPercent = parseInt(setting.threshold || "50", 10);
  const netChange = BigInt(ctx.balanceChangeLastHour);
  const currentBalance = BigInt(ctx.balanceNano);

  // If net outflow happened, check if it represents a big drop
  if (netChange < 0n) {
    const previousBalance = currentBalance - netChange; // netChange is negative, so this adds
    if (previousBalance > 0n) {
      const dropPercent =
        (Number(-netChange) / Number(previousBalance)) * 100;
      if (dropPercent >= thresholdPercent) {
        return {
          type: "balance_drop",
          address: ctx.address,
          agentName: ctx.agentName,
          message: `Balance dropped ${dropPercent.toFixed(1)}% in the last hour`,
          severity: "critical",
        };
      }
    }
  }
  return null;
}

export function evaluateAllRules(ctx: AlertContext): Alert[] {
  const checks = [
    checkLowBalance,
    checkLargeTx,
    checkInactive,
    checkHighFrequency,
    checkNewContract,
    checkBalanceDrop,
  ];

  const alerts: Alert[] = [];
  for (const check of checks) {
    const alert = check(ctx);
    if (alert) alerts.push(alert);
  }
  return alerts;
}
