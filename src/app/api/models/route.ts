import { proxyModels } from "@/lib/jev/proxy";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const result = await proxyModels({
    authorization: req.headers.get("authorization"),
    signal: req.signal,
  });
  return Response.json(result.body, { status: result.status });
}
