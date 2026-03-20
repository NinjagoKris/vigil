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

/**
 * CRC16-CCITT for TON address checksum
 */
function crc16(data: Buffer): number {
  let crc = 0;
  for (const byte of data) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc;
}

/**
 * Convert raw address (0:hex) to user-friendly format (UQ... non-bounceable)
 */
export function rawToFriendly(raw: string): string | null {
  try {
    const [wcStr, hexHash] = raw.split(":");
    if (!hexHash || hexHash.length !== 64) return null;

    const workchain = parseInt(wcStr, 10);
    const hash = Buffer.from(hexHash, "hex");

    // 0x51 = non-bounceable mainnet (UQ...)
    const flag = 0x51;
    const wc = workchain === -1 ? 0xff : workchain;

    const payload = Buffer.alloc(34);
    payload[0] = flag;
    payload[1] = wc;
    hash.copy(payload, 2);

    const checksum = crc16(payload);
    const full = Buffer.alloc(36);
    payload.copy(full);
    full[34] = (checksum >> 8) & 0xff;
    full[35] = checksum & 0xff;

    return full
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  } catch {
    return null;
  }
}

/**
 * Format any address to user-friendly. Passes through if already friendly.
 */
export function toFriendly(address: string): string {
  if (address.startsWith("EQ") || address.startsWith("UQ")) return address;
  if (address.includes(":")) return rawToFriendly(address) || address;
  return address;
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
