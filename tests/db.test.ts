import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initDatabase } from "../src/db/schema.js";
import { Queries } from "../src/db/queries.js";
import type Database from "better-sqlite3";
import { unlinkSync } from "fs";

const TEST_DB = "test-vigil.db";

describe("Database", () => {
  let db: Database.Database;
  let queries: Queries;

  beforeEach(() => {
    db = initDatabase(TEST_DB);
    queries = new Queries(db);
  });

  afterEach(() => {
    db.close();
    try {
      unlinkSync(TEST_DB);
    } catch {}
  });

  describe("agents", () => {
    it("adds and retrieves an agent", () => {
      queries.addAgent(123, "EQTest123", "TestAgent");
      const agents = queries.getAgentsByUser(123);
      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe("TestAgent");
      expect(agents[0].address).toBe("EQTest123");
    });

    it("removes an agent", () => {
      queries.addAgent(123, "EQTest123", "TestAgent");
      const removed = queries.removeAgent(123, "EQTest123");
      expect(removed).toBe(true);
      expect(queries.getAgentsByUser(123)).toHaveLength(0);
    });

    it("returns false when removing non-existent agent", () => {
      expect(queries.removeAgent(123, "EQNone")).toBe(false);
    });

    it("gets all watched addresses", () => {
      queries.addAgent(1, "EQAddr1", "A1");
      queries.addAgent(2, "EQAddr2", "A2");
      queries.addAgent(3, "EQAddr1", "A1Copy"); // same address, different user

      const addresses = queries.getAllWatchedAddresses();
      expect(addresses).toHaveLength(2);
      expect(addresses).toContain("EQAddr1");
      expect(addresses).toContain("EQAddr2");
    });

    it("gets users watching an address", () => {
      queries.addAgent(1, "EQAddr1", "A1");
      queries.addAgent(2, "EQAddr1", "A1Copy");
      queries.addAgent(3, "EQAddr2", "A2");

      const users = queries.getUsersWatchingAddress("EQAddr1");
      expect(users).toHaveLength(2);
      expect(users).toContain(1);
      expect(users).toContain(2);
    });

    it("updates balance", () => {
      queries.addAgent(1, "EQAddr1", "A1");
      queries.updateBalance("EQAddr1", "1500000000");
      const agent = queries.getAgent(1, "EQAddr1");
      expect(agent?.balance_nano).toBe("1500000000");
    });
  });

  describe("transactions", () => {
    it("adds and retrieves transactions", () => {
      const added = queries.addTransaction(
        "EQAddr1",
        "tx_hash_1",
        "100000000",
        "in",
        "EQCounterparty",
        1700000000,
        null
      );
      expect(added).toBe(true);

      const txns = queries.getTransactions("EQAddr1");
      expect(txns).toHaveLength(1);
      expect(txns[0].amount_nano).toBe("100000000");
      expect(txns[0].direction).toBe("in");
    });

    it("rejects duplicate tx_hash", () => {
      queries.addTransaction("EQAddr1", "tx1", "100", "in", null, 1700000000, null);
      const dup = queries.addTransaction("EQAddr1", "tx1", "200", "out", null, 1700000001, null);
      expect(dup).toBe(false);
    });

    it("gets today stats", () => {
      const now = Math.floor(Date.now() / 1000);
      queries.addTransaction("EQAddr1", "tx1", "100000000", "in", null, now, null);
      queries.addTransaction("EQAddr1", "tx2", "200000000", "out", null, now, null);

      const stats = queries.getTodayStats("EQAddr1");
      expect(stats.count).toBe(2);
    });
  });

  describe("alert settings", () => {
    it("creates default settings when adding agent", () => {
      queries.addAgent(1, "EQAddr1", "A1");
      const settings = queries.getAlertSettings(1);
      expect(settings.length).toBeGreaterThan(0);
      expect(settings.every((s) => s.enabled === 1)).toBe(true);
    });

    it("toggles alert", () => {
      queries.addAgent(1, "EQAddr1", "A1");
      queries.toggleAlert(1, "low_balance");
      const setting = queries.getAlertSetting(1, "low_balance");
      expect(setting?.enabled).toBe(0);

      queries.toggleAlert(1, "low_balance");
      const setting2 = queries.getAlertSetting(1, "low_balance");
      expect(setting2?.enabled).toBe(1);
    });
  });

  describe("known contracts", () => {
    it("tracks new contracts", () => {
      const isNew = queries.addKnownContract("EQAddr1", "EQContract1");
      expect(isNew).toBe(true);

      const isKnown = queries.isKnownContract("EQAddr1", "EQContract1");
      expect(isKnown).toBe(true);
    });

    it("returns false for already known", () => {
      queries.addKnownContract("EQAddr1", "EQContract1");
      const isNew = queries.addKnownContract("EQAddr1", "EQContract1");
      expect(isNew).toBe(false);
    });
  });
});
