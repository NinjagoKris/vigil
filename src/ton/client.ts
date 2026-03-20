const TONCENTER_HTTP_URL =
  process.env.TONCENTER_HTTP_URL || "https://toncenter.com/api/v3";
const TONCENTER_API_KEY = process.env.TONCENTER_API_KEY || "";

function headers(): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json" };
  if (TONCENTER_API_KEY) h["X-API-Key"] = TONCENTER_API_KEY;
  return h;
}

export async function getAccountBalance(address: string): Promise<string> {
  const url = `${TONCENTER_HTTP_URL}/account?address=${encodeURIComponent(address)}`;
  const response = await fetch(url, { headers: headers() });
  if (!response.ok) {
    throw new Error(`Toncenter HTTP error: ${response.status}`);
  }
  const data = (await response.json()) as { balance: string };
  return data.balance || "0";
}

export interface AccountInfo {
  balance: string;
  status: string;
  last_activity: number;
  is_wallet: boolean;
  raw_address: string;
}

export async function getAccountInfo(address: string): Promise<AccountInfo> {
  const url = `${TONCENTER_HTTP_URL}/account?address=${encodeURIComponent(address)}`;
  const response = await fetch(url, { headers: headers() });
  if (!response.ok) {
    throw new Error(`Toncenter HTTP error: ${response.status}`);
  }
  const data = (await response.json()) as {
    address: string;
    balance: string;
    status: string;
    last_activity: number;
    interfaces?: string[];
  };

  // Wallets have interfaces like "wallet_v4r2", "wallet_v5r1" etc.
  // Exchanges/pools have interfaces like "jetton_minter", "dex_pool" etc.
  const walletInterfaces = data.interfaces || [];
  const isWallet = walletInterfaces.some((i: string) =>
    i.toLowerCase().startsWith("wallet")
  );

  return {
    balance: data.balance || "0",
    status: data.status || "unknown",
    last_activity: data.last_activity || 0,
    is_wallet: isWallet,
    raw_address: data.address || "",
  };
}
