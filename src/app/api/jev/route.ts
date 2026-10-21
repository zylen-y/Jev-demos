import { proxySystemOne } from "@/lib/jev/proxy";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const bodyText = await req.text();
  const timeoutHeader = Number(req.headers.get("x-atlas-timeout-ms"));
  const retryHeader = Number(req.headers.get("x-atlas-max-retries"));
  const result = await proxySystemOne({
    authorization: req.headers.get("authorization"),
    bodyText,
    signal: req.signal,
    timeoutMs: Number.isFinite(timeoutHeader) ? timeoutHeader : undefined,
    maxRetries: Number.isFinite(retryHeader) ? retryHeader : undefined,
  });
  return Response.json(result.body, { status: result.status });
}
