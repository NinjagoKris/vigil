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

/**
 * Convert user-friendly TON address (EQ.../UQ...) to raw format (0:hex)
 * User-friendly = base64url(1 byte flag + 1 byte workchain + 32 bytes hash + 2 bytes crc)
 */
export function friendlyToRaw(address: string): string | null {
  try {
    // Normalize base64url to base64
    let b64 = address.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4 !== 0) b64 += "=";

    const bytes = Buffer.from(b64, "base64");
    if (bytes.length !== 36) return null;

    const workchain = bytes[1] === 0xff ? -1 : bytes[1];
    const hash = bytes.subarray(2, 34).toString("hex");
    return `${workchain}:${hash}`;
  } catch {
    return null;
  }
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
    raw_address: friendlyToRaw(address) || data.address || "",
  };
}
