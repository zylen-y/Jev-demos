import { proxySystemOne } from "@/lib/jev/proxy";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const bodyText = await req.text();
  const result = await proxySystemOne({
    authorization: req.headers.get("authorization"),
    bodyText,
    signal: req.signal,
    timeoutMs: headerNumber(req.headers.get("x-atlas-timeout-ms")),
    maxRetries: headerNumber(req.headers.get("x-atlas-max-retries")),
  });
  const headers = new Headers();
  if (result.upstreamMs != null && Number.isFinite(result.upstreamMs)) {
    headers.set("x-atlas-upstream-ms", String(Math.round(result.upstreamMs)));
  }
  if (result.modelMs != null && Number.isFinite(result.modelMs)) {
    headers.set("x-atlas-model-ms", String(Math.round(result.modelMs)));
  }
  return Response.json(result.body, { status: result.status, headers });
}

function headerNumber(value: string | null): number | undefined {
  if (value == null || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
