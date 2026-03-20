import { describe, it, expect } from "vitest";
import {
  checkLowBalance,
  checkLargeTx,
  checkHighFrequency,
  checkNewContract,
  checkBalanceDrop,
  evaluateAllRules,
  type AlertContext,
} from "../src/monitor/rules.js";

function makeCtx(overrides: Partial<AlertContext> = {}): AlertContext {
  return {
    address: "EQTest",
    agentName: "TestAgent",
    balanceNano: "1000000000", // 1 TON
    settings: [
      { id: 1, user_id: 1, alert_type: "low_balance", enabled: 1, threshold: "50000000" },
      { id: 2, user_id: 1, alert_type: "large_tx", enabled: 1, threshold: "1000000000" },
      { id: 3, user_id: 1, alert_type: "inactive", enabled: 1, threshold: "86400" },
      { id: 4, user_id: 1, alert_type: "high_frequency", enabled: 1, threshold: "50" },
      { id: 5, user_id: 1, alert_type: "new_contract", enabled: 1, threshold: "" },
      { id: 6, user_id: 1, alert_type: "balance_drop", enabled: 1, threshold: "50" },
    ],
    txCountLastHour: 5,
    isNewContract: false,
    balanceChangeLastHour: null,
    ...overrides,
  };
}

describe("Alert Rules", () => {
  describe("Low Balance", () => {
    it("triggers when balance is below threshold", () => {
      const alert = checkLowBalance(makeCtx({ balanceNano: "10000000" })); // 0.01 TON
      expect(alert).not.toBeNull();
      expect(alert?.type).toBe("low_balance");
      expect(alert?.severity).toBe("critical"); // < half of threshold
    });

    it("does not trigger when balance is above threshold", () => {
      const alert = checkLowBalance(makeCtx({ balanceNano: "100000000" })); // 0.1 TON
      expect(alert).toBeNull();
    });

    it("does not trigger when disabled", () => {
      const ctx = makeCtx({
        balanceNano: "10000000",
        settings: [
          { id: 1, user_id: 1, alert_type: "low_balance", enabled: 0, threshold: "50000000" },
        ],
      });
      expect(checkLowBalance(ctx)).toBeNull();
    });
  });

  describe("Large TX", () => {
    it("triggers on large transaction", () => {
      const ctx = makeCtx({
        transaction: {
          id: 1,
          agent_address: "EQTest",
          tx_hash: "tx1",
          amount_nano: "2000000000", // 2 TON
          direction: "out",
          counterparty: "EQOther",
          timestamp: 1700000000,
          raw_data: null,
        },
      });
      const alert = checkLargeTx(ctx);
      expect(alert).not.toBeNull();
      expect(alert?.type).toBe("large_tx");
    });

    it("does not trigger on small transaction", () => {
      const ctx = makeCtx({
        transaction: {
          id: 1,
          agent_address: "EQTest",
          tx_hash: "tx1",
          amount_nano: "500000000", // 0.5 TON
          direction: "in",
          counterparty: null,
          timestamp: 1700000000,
          raw_data: null,
        },
      });
      expect(checkLargeTx(ctx)).toBeNull();
    });
  });

  describe("High Frequency", () => {
    it("triggers when tx count exceeds threshold", () => {
      const alert = checkHighFrequency(makeCtx({ txCountLastHour: 60 }));
      expect(alert).not.toBeNull();
      expect(alert?.type).toBe("high_frequency");
    });

    it("does not trigger below threshold", () => {
      expect(checkHighFrequency(makeCtx({ txCountLastHour: 30 }))).toBeNull();
    });
  });

  describe("New Contract", () => {
    it("triggers on new contract interaction", () => {
      const ctx = makeCtx({
        isNewContract: true,
        transaction: {
          id: 1,
          agent_address: "EQTest",
          tx_hash: "tx1",
          amount_nano: "100000000",
          direction: "out",
          counterparty: "EQNewContract123456789",
          timestamp: 1700000000,
          raw_data: null,
        },
      });
      const alert = checkNewContract(ctx);
      expect(alert).not.toBeNull();
      expect(alert?.type).toBe("new_contract");
    });

    it("does not trigger for known contract", () => {
      expect(checkNewContract(makeCtx({ isNewContract: false }))).toBeNull();
    });
  });

  describe("Balance Drop", () => {
    it("triggers on 50%+ balance drop", () => {
      const ctx = makeCtx({
        balanceNano: "500000000", // 0.5 TON now
        balanceChangeLastHour: "-600000000", // net -0.6 TON outflow
      });
      const alert = checkBalanceDrop(ctx);
      expect(alert).not.toBeNull();
      expect(alert?.type).toBe("balance_drop");
      expect(alert?.severity).toBe("critical");
    });

    it("does not trigger on small drop", () => {
      const ctx = makeCtx({
        balanceNano: "900000000",
        balanceChangeLastHour: "-100000000", // 10% drop
      });
      expect(checkBalanceDrop(ctx)).toBeNull();
    });
  });

  describe("evaluateAllRules", () => {
    it("returns multiple alerts when multiple rules trigger", () => {
      const ctx = makeCtx({
        balanceNano: "10000000", // low balance
        txCountLastHour: 60, // high frequency
      });
      const alerts = evaluateAllRules(ctx);
      expect(alerts.length).toBeGreaterThanOrEqual(2);
      const types = alerts.map((a) => a.type);
      expect(types).toContain("low_balance");
      expect(types).toContain("high_frequency");
    });
  });
});
