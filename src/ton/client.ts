const TONCENTER_HTTP_URL =
  process.env.TONCENTER_HTTP_URL || "https://toncenter.com/api/v3";
const TONCENTER_API_KEY = process.env.TONCENTER_API_KEY || "";

export async function getAccountBalance(address: string): Promise<string> {
  const url = `${TONCENTER_HTTP_URL}/account?address=${encodeURIComponent(address)}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (TONCENTER_API_KEY) {
    headers["X-API-Key"] = TONCENTER_API_KEY;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Toncenter HTTP error: ${response.status}`);
  }

  const data = (await response.json()) as { balance: string };
  return data.balance || "0";
}
