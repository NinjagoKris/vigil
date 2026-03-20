import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { parseTxDetails, TransactionAnalyzer } from "../src/monitor/analyzer.js";
import { initDatabase } from "../src/db/schema.js";
import { Queries } from "../src/db/queries.js";
import type { ToncenterTransaction } from "../src/monitor/stream.js";
import type Database from "better-sqlite3";
import { unlinkSync } from "fs";

const TEST_DB = "test-analyzer.db";

function makeTx(overrides: Partial<ToncenterTransaction> = {}): ToncenterTransaction {
  return {
    hash: "tx_" + Math.random().toString(36).slice(2, 10),
    lt: "12345",
    account: "0:abc123",
    fee: "5000000",
    status: "finalized",
    now: Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

describe("parseTxDetails", () => {
  it("detects incoming TON transfer", () => {
    const tx = makeTx({
      account: "0:myaddr",
      in_msg: {
        source: "0:sender",
        destination: "0:myaddr",
        value: "500000000",
      },
    });
    const result = parseTxDetails(tx, "0:myaddr");
    expect(result.direction).toBe("in");
    expect(result.counterparty).toBe("0:sender");
    expect(result.amount).toBe("500000000");
  });

  it("detects outgoing TON transfer", () => {
    const tx = makeTx({
      account: "0:myaddr",
      out_msgs: [
        {
          source: "0:myaddr",
          destination: "0:receiver",
          value: "300000000",
        },
      ],
    });
    const result = parseTxDetails(tx, "0:myaddr");
    expect(result.direction).toBe("out");
    expect(result.counterparty).toBe("0:receiver");
    expect(result.amount).toBe("300000000");
  });

  it("sums multiple outgoing messages", () => {
    const tx = makeTx({
      account: "0:myaddr",
      out_msgs: [
        { source: "0:myaddr", destination: "0:r1", value: "100000000" },
        { source: "0:myaddr", destination: "0:r2", value: "200000000" },
      ],
    });
    const result = parseTxDetails(tx, "0:myaddr");
    expect(result.direction).toBe("out");
    expect(result.amount).toBe("300000000");
    expect(result.counterparty).toBe("0:r2"); // last destination
  });

  it("falls back to fee when no value transfer", () => {
    const tx = makeTx({
      account: "0:myaddr",
      fee: "7000000",
    });
    const result = parseTxDetails(tx, "0:myaddr");
    expect(result.direction).toBe("out");
    expect(result.counterparty).toBeNull();
    expect(result.amount).toBe("7000000");
  });

  it("ignores in_msg with zero value", () => {
    const tx = makeTx({
      account: "0:myaddr",
      in_msg: {
        source: "0:sender",
        destination: "0:myaddr",
        value: "0",
      },
      fee: "5000000",
    });
    const result = parseTxDetails(tx, "0:myaddr");
    expect(result.direction).toBe("out"); // falls through to fee
  });

  it("handles jetton-like transfer (out_msgs with payload)", () => {
    const tx = makeTx({
      account: "0:myaddr",
      out_msgs: [
        {
          source: "0:myaddr",
          destination: "0:jetton_wallet",
          value: "50000000",
          message: "transfer",
        },
      ],
    });
    const result = parseTxDetails(tx, "0:myaddr");
    expect(result.direction).toBe("out");
    expect(result.counterparty).toBe("0:jetton_wallet");
    expect(result.amount).toBe("50000000");
  });
});

describe("TransactionAnalyzer", () => {
  let db: Database.Database;
  let queries: Queries;
  let analyzer: TransactionAnalyzer;

  beforeEach(() => {
    db = initDatabase(TEST_DB);
    queries = new Queries(db);
    analyzer = new TransactionAnalyzer(queries);
  });

  afterEach(() => {
    db.close();
    try { unlinkSync(TEST_DB); } catch {}
  });

  it("skips addresses nobody is watching", async () => {
    const tx = makeTx({ account: "0:nobody" });
    const result = await analyzer.processTransaction(tx);
    expect(result.alerts).toHaveLength(0);
    expect(result.userIds).toHaveLength(0);
  });

  it("stores transaction and updates last_active", async () => {
    queries.addAgent(1, "0:watched", "TestAgent");
    const now = Math.floor(Date.now() / 1000);
    const tx = makeTx({
      account: "0:watched",
      now,
      in_msg: {
        source: "0:sender",
        destination: "0:watched",
        value: "100000000",
      },
    });

    await analyzer.processTransaction(tx);

    const txns = queries.getTransactions("0:watched");
    expect(txns).toHaveLength(1);
    expect(txns[0].direction).toBe("in");

    const agent = queries.getAgent(1, "0:watched");
    expect(agent?.last_active).toBe(now);
  });

  it("skips duplicate transactions", async () => {
    queries.addAgent(1, "0:watched", "TestAgent");
    const tx = makeTx({
      hash: "duplicate_hash",
      account: "0:watched",
      in_msg: {
        source: "0:s",
        destination: "0:watched",
        value: "100000000",
      },
    });

    await analyzer.processTransaction(tx);
    const result = await analyzer.processTransaction(tx);

    const txns = queries.getTransactions("0:watched");
    expect(txns).toHaveLength(1);
    expect(result.alerts).toHaveLength(0);
  });

  it("tracks new contracts", async () => {
    queries.addAgent(1, "0:watched", "TestAgent");
    const tx = makeTx({
      account: "0:watched",
      out_msgs: [
        { source: "0:watched", destination: "0:new_contract", value: "100000000" },
      ],
    });

    await analyzer.processTransaction(tx);

    expect(queries.isKnownContract("0:watched", "0:new_contract")).toBe(true);
  });

  it("handleBalanceUpdate updates the balance", () => {
    queries.addAgent(1, "0:addr", "Agent");
    analyzer.handleBalanceUpdate("0:addr", "999000000");
    const agent = queries.getAgent(1, "0:addr");
    expect(agent?.balance_nano).toBe("999000000");
  });

  it("calculates daily volume correctly", async () => {
    queries.addAgent(1, "0:watched", "Agent");
    const now = Math.floor(Date.now() / 1000);

    // Add several transactions manually
    queries.addTransaction("0:watched", "t1", "100000000", "in", null, now, null);
    queries.addTransaction("0:watched", "t2", "200000000", "out", null, now, null);
    queries.addTransaction("0:watched", "t3", "150000000", "in", null, now, null);

    const stats = queries.getTodayStats("0:watched");
    expect(stats.count).toBe(3);
    // Volume = sum of all amounts
    expect(Number(stats.volume)).toBe(450000000);
  });
});
