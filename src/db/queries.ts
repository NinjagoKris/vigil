import type Database from "better-sqlite3";

export interface Agent {
  id: number;
  user_id: number;
  address: string;
  name: string;
  balance_nano: string;
  last_active: number | null;
  added_at: number;
}

export interface Transaction {
  id: number;
  agent_address: string;
  tx_hash: string;
  amount_nano: string;
  direction: "in" | "out";
  counterparty: string | null;
  timestamp: number;
  raw_data: string | null;
}

export interface AlertSetting {
  id: number;
  user_id: number;
  alert_type: string;
  enabled: number;
  threshold: string | null;
}

export const ALERT_TYPES = {
  LOW_BALANCE: { type: "low_balance", defaultThreshold: "50000000" }, // 0.05 TON in nanoton
  LARGE_TX: { type: "large_tx", defaultThreshold: "1000000000" }, // 1 TON
  INACTIVE: { type: "inactive", defaultThreshold: "86400" }, // 24 hours in seconds
  HIGH_FREQUENCY: { type: "high_frequency", defaultThreshold: "50" }, // 50 txns/hour
  NEW_CONTRACT: { type: "new_contract", defaultThreshold: "" },
  BALANCE_DROP: { type: "balance_drop", defaultThreshold: "50" }, // 50%
} as const;

export class Queries {
  constructor(private db: Database.Database) {}

  addAgent(userId: number, address: string, name: string): void {
    this.db
      .prepare(
        "INSERT OR REPLACE INTO agents (user_id, address, name, added_at) VALUES (?, ?, ?, unixepoch())"
      )
      .run(userId, address, name);

    // Init default alert settings for this user
    for (const alert of Object.values(ALERT_TYPES)) {
      this.db
        .prepare(
          "INSERT OR IGNORE INTO alert_settings (user_id, alert_type, enabled, threshold) VALUES (?, ?, 1, ?)"
        )
        .run(userId, alert.type, alert.defaultThreshold);
    }
  }

  removeAgent(userId: number, address: string): boolean {
    const result = this.db
      .prepare("DELETE FROM agents WHERE user_id = ? AND address = ?")
      .run(userId, address);
    return result.changes > 0;
  }

  getAgentsByUser(userId: number): Agent[] {
    return this.db
      .prepare("SELECT * FROM agents WHERE user_id = ? ORDER BY added_at")
      .all(userId) as Agent[];
  }

  getAgent(userId: number, address: string): Agent | undefined {
    return this.db
      .prepare("SELECT * FROM agents WHERE user_id = ? AND address = ?")
      .get(userId, address) as Agent | undefined;
  }

  getAllWatchedAddresses(): string[] {
    const rows = this.db
      .prepare("SELECT DISTINCT address FROM agents")
      .all() as { address: string }[];
    return rows.map((r) => r.address);
  }

  getUsersWatchingAddress(address: string): number[] {
    const rows = this.db
      .prepare("SELECT DISTINCT user_id FROM agents WHERE address = ?")
      .all(address) as { user_id: number }[];
    return rows.map((r) => r.user_id);
  }

  updateBalance(address: string, balanceNano: string): void {
    this.db
      .prepare("UPDATE agents SET balance_nano = ? WHERE address = ?")
      .run(balanceNano, address);
  }

  updateLastActive(address: string, timestamp: number): void {
    this.db
      .prepare("UPDATE agents SET last_active = ? WHERE address = ?")
      .run(timestamp, address);
  }

  addTransaction(
    agentAddress: string,
    txHash: string,
    amountNano: string,
    direction: "in" | "out",
    counterparty: string | null,
    timestamp: number,
    rawData: string | null
  ): boolean {
    try {
      this.db
        .prepare(
          `INSERT INTO transactions (agent_address, tx_hash, amount_nano, direction, counterparty, timestamp, raw_data)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          agentAddress,
          txHash,
          amountNano,
          direction,
          counterparty,
          timestamp,
          rawData
        );
      return true;
    } catch {
      // Duplicate tx_hash
      return false;
    }
  }

  getTransactions(agentAddress: string, limit: number = 20): Transaction[] {
    return this.db
      .prepare(
        "SELECT * FROM transactions WHERE agent_address = ? ORDER BY timestamp DESC LIMIT ?"
      )
      .all(agentAddress, limit) as Transaction[];
  }

  getTransactionsSince(agentAddress: string, since: number): Transaction[] {
    return this.db
      .prepare(
        "SELECT * FROM transactions WHERE agent_address = ? AND timestamp >= ? ORDER BY timestamp DESC"
      )
      .all(agentAddress, since) as Transaction[];
  }

  getTodayStats(agentAddress: string): { count: number; volume: string } {
    const startOfDay =
      Math.floor(Date.now() / 1000) - (Math.floor(Date.now() / 1000) % 86400);
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as count, COALESCE(SUM(CAST(amount_nano AS INTEGER)), 0) as volume
         FROM transactions WHERE agent_address = ? AND timestamp >= ?`
      )
      .get(agentAddress, startOfDay) as { count: number; volume: string };
    return row;
  }

  getAlertSettings(userId: number): AlertSetting[] {
    return this.db
      .prepare(
        "SELECT * FROM alert_settings WHERE user_id = ? ORDER BY alert_type"
      )
      .all(userId) as AlertSetting[];
  }

  getAlertSetting(
    userId: number,
    alertType: string
  ): AlertSetting | undefined {
    return this.db
      .prepare(
        "SELECT * FROM alert_settings WHERE user_id = ? AND alert_type = ?"
      )
      .get(userId, alertType) as AlertSetting | undefined;
  }

  toggleAlert(userId: number, alertType: string): boolean {
    const current = this.getAlertSetting(userId, alertType);
    if (!current) return false;
    const newEnabled = current.enabled ? 0 : 1;
    this.db
      .prepare(
        "UPDATE alert_settings SET enabled = ? WHERE user_id = ? AND alert_type = ?"
      )
      .run(newEnabled, userId, alertType);
    return true;
  }

  updateAlertThreshold(
    userId: number,
    alertType: string,
    threshold: string
  ): void {
    this.db
      .prepare(
        "UPDATE alert_settings SET threshold = ? WHERE user_id = ? AND alert_type = ?"
      )
      .run(threshold, userId, alertType);
  }

  addKnownContract(agentAddress: string, contractAddress: string): boolean {
    try {
      this.db
        .prepare(
          "INSERT INTO known_contracts (agent_address, contract_address) VALUES (?, ?)"
        )
        .run(agentAddress, contractAddress);
      return true; // New contract
    } catch {
      return false; // Already known
    }
  }

  isKnownContract(agentAddress: string, contractAddress: string): boolean {
    const row = this.db
      .prepare(
        "SELECT 1 FROM known_contracts WHERE agent_address = ? AND contract_address = ?"
      )
      .get(agentAddress, contractAddress);
    return !!row;
  }

  getBalanceOneHourAgo(address: string): string | null {
    const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;
    // Estimate balance by summing transactions in the last hour
    // This is an approximation - we track the delta
    const row = this.db
      .prepare(
        `SELECT
           SUM(CASE WHEN direction = 'in' THEN CAST(amount_nano AS INTEGER) ELSE 0 END) as total_in,
           SUM(CASE WHEN direction = 'out' THEN CAST(amount_nano AS INTEGER) ELSE 0 END) as total_out
         FROM transactions WHERE agent_address = ? AND timestamp >= ?`
      )
      .get(address, oneHourAgo) as {
      total_in: number | null;
      total_out: number | null;
    };

    if (!row.total_in && !row.total_out) return null;
    const netChange = (row.total_in || 0) - (row.total_out || 0);
    return netChange.toString();
  }
}
