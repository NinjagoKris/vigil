import type { Queries } from "../db/queries.js";
import type { ToncenterTransaction } from "./stream.js";
import { evaluateAllRules, type Alert, type AlertContext } from "./rules.js";
import { getAccountBalance } from "../ton/client.js";
import { clearInactivityAlert } from "./inactivity.js";

export class TransactionAnalyzer {
  // Track addresses that received a balance via WebSocket recently
  // so we skip the redundant HTTP call
  private wsBalanceReceived = new Set<string>();
  // Dedup: skip tx hashes we already processed (WebSocket can send same tx multiple times)
  private processedTxHashes = new Set<string>();

  constructor(private queries: Queries) {}

  async processTransaction(
    tx: ToncenterTransaction
  ): Promise<{ alerts: Alert[]; userIds: number[] }> {
    // Fast in-memory dedup before touching DB
    if (this.processedTxHashes.has(tx.hash)) {
      return { alerts: [], userIds: [] };
    }
    this.processedTxHashes.add(tx.hash);
    // Keep set bounded
    if (this.processedTxHashes.size > 5000) {
      const entries = [...this.processedTxHashes];
      this.processedTxHashes = new Set(entries.slice(-2500));
    }

    const address = tx.account; // raw format from WebSocket (0:HEX)
    const userIds = this.queries.getUsersWatchingAddress(address);

    if (userIds.length === 0) {
      return { alerts: [], userIds: [] };
    }


    // Determine direction and counterparty
    const { direction, counterparty, amount } = parseTxDetails(tx, address);

    // Store transaction
    const isNew = this.queries.addTransaction(
      address,
      tx.hash,
      amount,
      direction,
      counterparty,
      tx.now,
      JSON.stringify(tx)
    );

    if (!isNew) {
      return { alerts: [], userIds };
    }

    // Update last active
    this.queries.updateLastActive(address, tx.now);

    // Clear inactivity dedup for all watchers
    for (const uid of userIds) {
      clearInactivityAlert(uid, address);
    }

    // Track known contracts
    let isNewContract = false;
    if (counterparty) {
      isNewContract = this.queries.addKnownContract(address, counterparty);
    }

    // Fetch balance only if WebSocket hasn't provided it recently
    if (!this.wsBalanceReceived.has(address)) {
      try {
        const balance = await getAccountBalance(address);
        this.queries.updateBalance(address, balance);
      } catch (err) {
        console.error(`[Analyzer] Failed to fetch balance for ${address}:`, err);
      }
    }
    this.wsBalanceReceived.delete(address);

    // Evaluate alert rules for each watching user
    const allAlerts: Alert[] = [];
    const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;
    const recentTxns = this.queries.getTransactionsSince(address, oneHourAgo);

    for (const userId of userIds) {
      const agent = this.queries.getAgent(userId, address);
      if (!agent) continue;

      const settings = this.queries.getAlertSettings(userId);
      const balanceChange = this.queries.getBalanceOneHourAgo(address);
      const txRecord = this.queries.getTransactions(address, 1)[0];

      const ctx: AlertContext = {
        address,
        agentName: agent.name,
        balanceNano: agent.balance_nano,
        transaction: txRecord,
        settings,
        txCountLastHour: recentTxns.length,
        isNewContract,
        balanceChangeLastHour: balanceChange,
      };

      const alerts = evaluateAllRules(ctx);
      if (alerts.length > 0) {
        console.log(`[Analyzer] ${alerts.length} alert(s) for user ${userId}: ${alerts.map(a => a.type).join(", ")}`);
      }
      allAlerts.push(...alerts);
    }

    return { alerts: allAlerts, userIds };
  }

  handleBalanceUpdate(address: string, balanceNano: string): void {
    this.wsBalanceReceived.add(address);
    this.queries.updateBalance(address, balanceNano);
  }
}

export function parseTxDetails(
  tx: ToncenterTransaction,
  watchedAddress: string
): {
  direction: "in" | "out";
  counterparty: string | null;
  amount: string;
} {
  // Check incoming message
  if (tx.in_msg && tx.in_msg.value && tx.in_msg.value !== "0") {
    if (
      tx.in_msg.destination === watchedAddress ||
      tx.in_msg.destination?.includes(watchedAddress.replace("0:", ""))
    ) {
      return {
        direction: "in",
        counterparty: tx.in_msg.source || null,
        amount: tx.in_msg.value,
      };
    }
  }

  // Check outgoing messages
  if (tx.out_msgs && tx.out_msgs.length > 0) {
    let totalOut = 0n;
    let lastDest: string | null = null;
    for (const msg of tx.out_msgs) {
      if (msg.value && msg.value !== "0") {
        totalOut += BigInt(msg.value);
        lastDest = msg.destination || null;
      }
    }
    if (totalOut > 0n) {
      return {
        direction: "out",
        counterparty: lastDest,
        amount: totalOut.toString(),
      };
    }
  }

  // Fallback: use fee as amount if no value transfer
  return {
    direction: "out",
    counterparty: null,
    amount: tx.fee || "0",
  };
}
