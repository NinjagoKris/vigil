import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { Queries } from "../db/queries.js";
import { formatTon, timeAgo } from "../bot/formatters.js";
import type { ToncenterStream } from "../monitor/stream.js";

export function createMcpServer(
  queries: Queries,
  stream: ToncenterStream
): McpServer {
  const server = new McpServer({
    name: "vigil",
    version: "1.0.0",
  });

  server.tool(
    "watch_agent",
    "Add an agent address to monitor on TON blockchain",
    {
      address: z.string().describe("TON address of the agent"),
      name: z.string().describe("Human-readable name for the agent"),
      user_id: z
        .number()
        .optional()
        .describe("Telegram user ID (default: 0 for MCP-only)"),
    },
    async ({ address, name, user_id }) => {
      const userId = user_id ?? 0;
      queries.addAgent(userId, address, name);
      stream.subscribe([address]);
      return {
        content: [
          {
            type: "text" as const,
            text: `Now watching agent "${name}" at ${address}`,
          },
        ],
      };
    }
  );

  server.tool(
    "unwatch_agent",
    "Remove an agent from monitoring",
    {
      address: z.string().describe("TON address to stop monitoring"),
      user_id: z.number().optional().describe("Telegram user ID (default: 0)"),
    },
    async ({ address, user_id }) => {
      const userId = user_id ?? 0;
      const removed = queries.removeAgent(userId, address);
      if (removed) {
        const others = queries.getUsersWatchingAddress(address);
        if (others.length === 0) {
          stream.unsubscribe([address]);
        }
      }
      return {
        content: [
          {
            type: "text" as const,
            text: removed
              ? `Stopped watching ${address}`
              : `Address ${address} not found in watchlist`,
          },
        ],
      };
    }
  );

  server.tool(
    "list_agents",
    "List all monitored agents",
    {
      user_id: z.number().optional().describe("Telegram user ID (default: 0)"),
    },
    async ({ user_id }) => {
      const userId = user_id ?? 0;
      const agents = queries.getAgentsByUser(userId);

      if (agents.length === 0) {
        return {
          content: [
            { type: "text" as const, text: "No agents being monitored." },
          ],
        };
      }

      const lines = agents.map((a) => {
        const balance = formatTon(a.balance_nano);
        const last = timeAgo(a.last_active);
        return `- ${a.name} (${a.address}): ${balance} TON, last active ${last}`;
      });

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    }
  );

  server.tool(
    "get_agent_status",
    "Get detailed status of a specific agent",
    {
      address: z.string().describe("TON address of the agent"),
      user_id: z.number().optional().describe("Telegram user ID (default: 0)"),
    },
    async ({ address, user_id }) => {
      const userId = user_id ?? 0;
      const agent = queries.getAgent(userId, address);
      if (!agent) {
        return {
          content: [{ type: "text" as const, text: `Agent ${address} not found` }],
        };
      }

      const stats = queries.getTodayStats(address);
      const recentTxns = queries.getTransactions(address, 5);

      const txLines = recentTxns.map((tx) => {
        const dir = tx.direction === "in" ? "IN" : "OUT";
        return `  ${dir} ${formatTon(tx.amount_nano)} TON ${timeAgo(tx.timestamp)}`;
      });

      const text = [
        `Agent: ${agent.name}`,
        `Address: ${agent.address}`,
        `Balance: ${formatTon(agent.balance_nano)} TON`,
        `Last active: ${timeAgo(agent.last_active)}`,
        `Today: ${stats.count} txns, ${formatTon(stats.volume)} TON volume`,
        recentTxns.length > 0 ? `Recent:\n${txLines.join("\n")}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      return {
        content: [{ type: "text" as const, text }],
      };
    }
  );

  server.tool(
    "get_agent_history",
    "Get transaction history for an agent",
    {
      address: z.string().describe("TON address of the agent"),
      limit: z
        .number()
        .optional()
        .describe("Number of transactions to return (default: 20)"),
    },
    async ({ address, limit }) => {
      const txns = queries.getTransactions(address, limit ?? 20);

      if (txns.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No transactions found for ${address}`,
            },
          ],
        };
      }

      const lines = txns.map((tx) => {
        const dir = tx.direction === "in" ? "📥 IN" : "📤 OUT";
        const amount = formatTon(tx.amount_nano);
        const cp = tx.counterparty || "—";
        const time = new Date(tx.timestamp * 1000).toISOString();
        return `${dir} ${amount} TON | ${cp} | ${time}`;
      });

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    }
  );

  server.tool(
    "get_alerts",
    "Get current alert settings",
    {
      user_id: z.number().optional().describe("Telegram user ID (default: 0)"),
    },
    async ({ user_id }) => {
      const userId = user_id ?? 0;
      const settings = queries.getAlertSettings(userId);

      if (settings.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No alert settings configured. Add an agent first.",
            },
          ],
        };
      }

      const lines = settings.map((s) => {
        const status = s.enabled ? "ON" : "OFF";
        return `${s.alert_type}: ${status} (threshold: ${s.threshold || "—"})`;
      });

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    }
  );

  return server;
}

// Run as standalone MCP stdio server
if (process.argv[1]?.endsWith("server.ts") || process.argv[1]?.endsWith("server.js")) {
  const { initDatabase } = await import("../db/schema.js");
  const { Queries } = await import("../db/queries.js");
  const { ToncenterStream } = await import("../monitor/stream.js");

  const db = initDatabase();
  const q = new Queries(db);
  const stream = new ToncenterStream({
    url: process.env.TONCENTER_WS_URL || "wss://toncenter.com/api/streaming/v2/ws",
    apiKey: process.env.TONCENTER_API_KEY,
  });

  const mcpServer = createMcpServer(q, stream);
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
}
