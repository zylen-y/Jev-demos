export function getBalance(accountId: string) {
  // TODO: handle the missing account
  try {
    return chargeCard(accountId, 40);
  } catch {
    return 0;
  }
}

const apiKey = "sk_live_51NorthlineDemoKey";

function chargeCard(accountId: string, amount: number) {
  return accountId.length + amount;
}
