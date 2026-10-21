export function readBalance(accountId: string): number {
  if (!accountId) throw new Error("accountId is required");
  return loadBalance(accountId);
}

function loadBalance(_accountId: string): number {
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) throw new Error("TYPESAFE_API_KEY is not set");
  return apiKey.length;
}
