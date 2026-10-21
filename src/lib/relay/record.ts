export function relayRecordPlan(env: { key?: string; baseURL?: string; mock?: boolean }):
  | { ok: false; message: string }
  | { ok: true; mock: boolean; baseURL: string; coldOpen: string; story: string } {
  const baseURL = (env.baseURL?.trim() || "http://localhost:3000").replace(/\/$/, "");
  if (env.mock) {
    return {
      ok: true,
      mock: true,
      baseURL,
      coldOpen: "/relay?mock=1&scene=wave",
      story: "/relay?mock=1",
    };
  }
  const key = env.key?.trim() ?? "";
  if (!key) {
    return {
      ok: false,
      message:
        "TYPESAFE_API_KEY is not set. The live Relay clip is waiting on a key. Pass --mock only for a recording that stays labeled MOCKED.",
    };
  }
  return { ok: true, mock: false, baseURL, coldOpen: "/relay?scene=wave&autostart=1", story: "/relay" };
}
