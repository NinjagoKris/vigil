import type { Bot } from "grammy";
import type { Queries } from "../db/queries.js";

// Track when we last sent an inactivity alert per user+address
// to avoid spamming every hour
const lastAlerted = new Map<string, number>();

function alertKey(userId: number, address: string): string {
  return `${userId}:${address}`;
}

export function startInactivityChecker(
  bot: Bot,
  queries: Queries,
  intervalMs: number = 3600000
): ReturnType<typeof setInterval> {
  return setInterval(async () => {
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

        if (inactiveDuration <= threshold) continue;

        // Deduplicate: don't alert again within the threshold period
        const key = alertKey(userId, address);
        const lastSent = lastAlerted.get(key) || 0;
        if (now - lastSent < threshold) continue;

        const hours = Math.floor(inactiveDuration / 3600);
        const message = `💤 <b>INACTIVE</b>\n\n<b>${agent.name}</b>\nNo activity for ${hours} hours`;

        try {
          await bot.api.sendMessage(userId, message, {
            parse_mode: "HTML",
          });
          lastAlerted.set(key, now);
        } catch (err) {
          console.error(
            `[Inactivity] Failed to send to user ${userId}:`,
            err
          );
        }
      }
    }
  }, intervalMs);
}

// Clear dedup state when an agent becomes active again
export function clearInactivityAlert(
  userId: number,
  address: string
): void {
  lastAlerted.delete(alertKey(userId, address));
}
