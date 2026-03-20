import Database from "better-sqlite3";

export function initDatabase(dbPath: string = "vigil.db"): Database.Database {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      address TEXT NOT NULL,
      raw_address TEXT,
      name TEXT NOT NULL,
      balance_nano TEXT DEFAULT '0',
      last_active INTEGER,
      added_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(user_id, address)
    );

    CREATE TABLE IF NOT EXISTS alert_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      alert_type TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      threshold TEXT,
      UNIQUE(user_id, alert_type)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_address TEXT NOT NULL,
      tx_hash TEXT NOT NULL UNIQUE,
      amount_nano TEXT NOT NULL,
      direction TEXT NOT NULL CHECK(direction IN ('in', 'out')),
      counterparty TEXT,
      timestamp INTEGER NOT NULL,
      raw_data TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS known_contracts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_address TEXT NOT NULL,
      contract_address TEXT NOT NULL,
      first_seen INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(agent_address, contract_address)
    );

    CREATE INDEX IF NOT EXISTS idx_agents_user ON agents(user_id);
    CREATE INDEX IF NOT EXISTS idx_agents_address ON agents(address);
    CREATE INDEX IF NOT EXISTS idx_agents_raw_address ON agents(raw_address);
    CREATE INDEX IF NOT EXISTS idx_tx_agent ON transactions(agent_address);
    CREATE INDEX IF NOT EXISTS idx_tx_timestamp ON transactions(timestamp);
    CREATE INDEX IF NOT EXISTS idx_known_agent ON known_contracts(agent_address);
  `);

  // Migration: add raw_address column if it doesn't exist (for existing databases)
  const columns = db.pragma("table_info(agents)") as Array<{ name: string }>;
  if (!columns.some((c) => c.name === "raw_address")) {
    db.exec("ALTER TABLE agents ADD COLUMN raw_address TEXT");
  }

  return db;
}
