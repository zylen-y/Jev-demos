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
  return Response.json(result.body, { status: result.status });
}

function headerNumber(value: string | null): number | undefined {
  if (value == null || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
