import WebSocket from "ws";
import { EventEmitter } from "events";

export interface ToncenterTransaction {
  hash: string;
  lt: string;
  account: string;
  fee: string;
  status: string;
  now: number;
  in_msg?: {
    source: string;
    destination: string;
    value: string;
    message?: string;
  };
  out_msgs?: Array<{
    source: string;
    destination: string;
    value: string;
    message?: string;
  }>;
}

export interface StreamEvent {
  type: string;
  finality: string;
  transactions?: ToncenterTransaction[];
  account?: string;
  state?: {
    balance: string;
    account_status: string;
  };
  address_book?: Record<string, { name?: string }>;
}

export interface ToncenterStreamOptions {
  url: string;
  apiKey?: string;
}

export class ToncenterStream extends EventEmitter {
  private ws: WebSocket | null = null;
  private addresses: Set<string> = new Set();
  private reconnectAttempt = 0;
  private maxReconnectDelay = 30000;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private url: string;
  private apiKey?: string;

  constructor(options: ToncenterStreamOptions) {
    super();
    this.url = options.url;
    this.apiKey = options.apiKey;
  }

  connect(): void {
    if (this.closed) return;

    const url = this.apiKey
      ? `${this.url}?api_key=${this.apiKey}`
      : this.url;

    this.ws = new WebSocket(url);

    this.ws.on("open", () => {
      console.log("[Stream] WebSocket connected");
      this.reconnectAttempt = 0;
      this.startPing();

      // Resubscribe if we have addresses
      if (this.addresses.size > 0) {
        this.sendSubscribe([...this.addresses]);
      }

      this.emit("connected");
    });

    this.ws.on("message", (data: WebSocket.Data) => {
      try {
        const event = JSON.parse(data.toString()) as StreamEvent & {
          id?: string;
          status?: string;
        };

        // Handle subscription confirmations and pongs
        if (event.status === "subscribed" || event.status === "unsubscribed") {
          console.log(`[Stream] ${event.status} (id: ${event.id})`);
          return;
        }
        if (event.status === "pong") return;

        // Emit parsed events
        if (event.type === "transactions" && event.transactions) {
          for (const tx of event.transactions) {
            this.emit("transaction", tx, event.finality);
          }
        }

        if (event.type === "account_state_change" && event.account && event.state) {
          this.emit("balance", event.account, event.state.balance);
        }

        this.emit("event", event);
      } catch (err) {
        console.error("[Stream] Failed to parse message:", err);
      }
    });

    this.ws.on("close", (code, reason) => {
      console.log(`[Stream] Disconnected: ${code} ${reason.toString()}`);
      this.stopPing();
      if (!this.closed) {
        this.scheduleReconnect();
      }
    });

    this.ws.on("error", (err) => {
      console.error("[Stream] WebSocket error:", err.message);
    });
  }

  private sendSubscribe(addresses: string[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const msg = {
      operation: "subscribe",
      id: `sub-${Date.now()}`,
      addresses,
      types: ["transactions", "account_state_change"],
      min_finality: "finalized",
    };

    this.ws.send(JSON.stringify(msg));
    console.log(`[Stream] Subscribed to ${addresses.length} addresses`);
  }

  private sendUnsubscribe(addresses: string[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const msg = {
      operation: "unsubscribe",
      id: `unsub-${Date.now()}`,
      addresses,
    };

    this.ws.send(JSON.stringify(msg));
  }

  subscribe(addresses: string[]): void {
    const newAddresses = addresses.filter((a) => !this.addresses.has(a));
    if (newAddresses.length === 0) return;

    for (const addr of newAddresses) {
      this.addresses.add(addr);
    }

    this.sendSubscribe(newAddresses);
  }

  unsubscribe(addresses: string[]): void {
    const toRemove = addresses.filter((a) => this.addresses.has(a));
    if (toRemove.length === 0) return;

    for (const addr of toRemove) {
      this.addresses.delete(addr);
    }

    this.sendUnsubscribe(toRemove);
  }

  private startPing(): void {
    this.stopPing();
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(
          JSON.stringify({ operation: "ping", id: `ping-${Date.now()}` })
        );
      }
    }, 15000);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private scheduleReconnect(): void {
    const delay = Math.min(
      1000 * Math.pow(2, this.reconnectAttempt),
      this.maxReconnectDelay
    );
    console.log(
      `[Stream] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempt + 1})`
    );
    this.reconnectAttempt++;

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  close(): void {
    this.closed = true;
    this.stopPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  get watchedAddresses(): string[] {
    return [...this.addresses];
  }
}
