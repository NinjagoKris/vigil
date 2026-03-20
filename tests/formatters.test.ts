import { describe, it, expect } from "vitest";
import {
  nanoToTon,
  formatTon,
  shortAddress,
  timeAgo,
  formatDashboard,
  formatAgentList,
  formatAlert,
} from "../src/bot/formatters.js";

describe("Formatters", () => {
  describe("nanoToTon", () => {
    it("converts nanoton to TON", () => {
      expect(nanoToTon("1000000000")).toBe(1);
      expect(nanoToTon("500000000")).toBe(0.5);
      expect(nanoToTon("0")).toBe(0);
    });
  });

  describe("formatTon", () => {
    it("formats with 4 decimal places", () => {
      expect(formatTon("1500000000")).toBe("1.5000");
      expect(formatTon("50000000")).toBe("0.0500");
    });
  });

  describe("shortAddress", () => {
    it("shortens long addresses", () => {
      const addr = "EQBCVdabcdefghijklmnopq_br";
      const short = shortAddress(addr);
      expect(short).toBe("EQBCVd...q_br");
    });

    it("returns short addresses unchanged", () => {
      expect(shortAddress("EQShort")).toBe("EQShort");
    });
  });

  describe("timeAgo", () => {
    it("handles null", () => {
      expect(timeAgo(null)).toBe("Never");
    });

    it("formats seconds", () => {
      const now = Math.floor(Date.now() / 1000);
      expect(timeAgo(now - 30)).toBe("30s ago");
    });

    it("formats minutes", () => {
      const now = Math.floor(Date.now() / 1000);
      expect(timeAgo(now - 120)).toBe("2 min ago");
    });

    it("formats hours", () => {
      const now = Math.floor(Date.now() / 1000);
      expect(timeAgo(now - 7200)).toBe("2 hours ago");
    });
  });

  describe("formatDashboard", () => {
    it("shows empty state", () => {
      const result = formatDashboard([], new Map());
      expect(result).toContain("No agents");
    });

    it("shows agents with stats", () => {
      const agents = [
        {
          id: 1,
          user_id: 1,
          address: "EQBCVdabcdefghijklmnopq_br",
          name: "Translation Agent",
          balance_nano: "1450000000",
          last_active: Math.floor(Date.now() / 1000) - 120,
          added_at: 1700000000,
        },
      ];
      const stats = new Map([
        ["EQBCVdabcdefghijklmnopq_br", { count: 12, volume: "800000000" }],
      ]);
      const result = formatDashboard(agents, stats);
      expect(result).toContain("Translation Agent");
      expect(result).toContain("1.4500 TON");
      expect(result).toContain("12");
    });
  });

  describe("formatAlert", () => {
    it("formats warning alert", () => {
      const result = formatAlert({
        type: "large_tx",
        address: "EQTest123456789012345",
        agentName: "TestAgent",
        message: "Outgoing 2.5 TON",
        severity: "warning",
      });
      expect(result).toContain("LARGE TRANSACTION");
      expect(result).toContain("TestAgent");
    });

    it("formats critical alert", () => {
      const result = formatAlert({
        type: "low_balance",
        address: "EQTest",
        agentName: "Agent",
        message: "Balance low",
        severity: "critical",
      });
      expect(result).toContain("🔴");
    });
  });
});
