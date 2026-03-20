import "dotenv/config";
import WebSocket from "ws";

const url = process.env.TONCENTER_WS_URL || "wss://toncenter.com/api/streaming/v2/ws";
const apiKey = process.env.TONCENTER_API_KEY || "";
const address = "UQABGo8KCza3ea8DNHMnSWZmbRzW-05332eTdfvW-XDQEmnJ";

const wsUrl = apiKey ? `${url}?api_key=${apiKey}` : url;
console.log("Connecting to:", url);

const ws = new WebSocket(wsUrl);

ws.on("open", () => {
  console.log("Connected!");

  const sub = {
    operation: "subscribe",
    id: "test-sub",
    addresses: [address],
    types: ["transactions", "account_state_change"],
    min_finality: "finalized",
  };

  console.log("Subscribing to:", address);
  console.log("Message:", JSON.stringify(sub));
  ws.send(JSON.stringify(sub));
});

ws.on("message", (data: WebSocket.Data) => {
  const msg = JSON.parse(data.toString());
  const now = new Date().toISOString();

  if (msg.status === "pong") return;

  if (msg.status === "subscribed") {
    console.log(`[${now}] Subscribed OK. Waiting for transactions...`);
    return;
  }

  if (msg.type === "transactions" && msg.transactions) {
    for (const tx of msg.transactions) {
      console.log(`[${now}] TX received!`);
      console.log("  hash:", tx.hash);
      console.log("  account:", tx.account);
      console.log("  in_msg:", JSON.stringify(tx.in_msg?.value), "from", tx.in_msg?.source?.slice(0, 20));
      console.log("  out_msgs:", tx.out_msgs?.length, "msgs");
      if (tx.out_msgs?.[0]) {
        console.log("  first out:", JSON.stringify(tx.out_msgs[0].value), "to", tx.out_msgs[0].destination?.slice(0, 20));
      }
    }
    return;
  }

  if (msg.type === "account_state_change") {
    console.log(`[${now}] BALANCE UPDATE: ${msg.state?.balance} for ${msg.account}`);
    return;
  }

  console.log(`[${now}] Other event:`, msg.type || msg.status, JSON.stringify(msg).slice(0, 200));
});

ws.on("error", (err) => {
  console.error("WS Error:", err.message);
});

ws.on("close", (code, reason) => {
  console.log("Disconnected:", code, reason.toString());
});

// Ping every 15s
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ operation: "ping", id: "p" }));
  }
}, 15000);

console.log("Waiting up to 5 minutes for events...");
setTimeout(() => {
  console.log("Timeout - closing");
  ws.close();
  process.exit(0);
}, 300000);
