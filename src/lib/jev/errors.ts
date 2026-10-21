export class JevCallError extends Error {
  readonly status: number;
  readonly requestId?: string;

  constructor(status: number, message: string, requestId?: string) {
    super(message);
    this.name = "JevCallError";
    this.status = status;
    this.requestId = requestId;
  }
}

export function messageForStatus(status: number, body: unknown): string {
  const detail = detailMessage(body);
  if (status === 400) {
    return detail || "Jev rejected the request. Check the state and questions.";
  }
  if (status === 401) {
    return "That API key was rejected. Check it in the TypeSafe console and paste it again.";
  }
  if (status === 403) {
    return "This key does not have permission to call Jev.";
  }
  if (status === 404) {
    return "The TypeSafe endpoint was not found.";
  }
  if (status === 413) {
    return "That request is over the size limit.";
  }
  if (status === 415) {
    return "The request encoding is not supported.";
  }
  if (status === 422) {
    return detail || "Jev could not validate that request.";
  }
  if (status === 429) {
    return "Rate limit reached. Wait a moment, then run it again.";
  }
  if (status === 529) {
    return "TypeSafe is temporarily overloaded. Retry in a moment.";
  }
  if (status >= 500) {
    return "TypeSafe returned a server error. Retry in a moment.";
  }
  return detail || `The request failed (${status}).`;
}

function detailMessage(body: unknown): string {
  if (!body || typeof body !== "object") {
    return typeof body === "string" ? body.slice(0, 400) : "";
  }
  const record = body as Record<string, unknown>;
  if (typeof record.error === "string" && record.error.trim()) return record.error;
  if (typeof record.message === "string" && record.message.trim()) return record.message;
  if (Array.isArray(record.detail)) {
    const parts = record.detail
      .map((item) => {
        if (!item || typeof item !== "object") return "";
        const entry = item as { loc?: unknown; msg?: unknown };
        const msg = typeof entry.msg === "string" ? entry.msg : "";
        const loc = Array.isArray(entry.loc) ? entry.loc.map(String).join(".") : "";
        return loc ? `${loc}: ${msg}` : msg;
      })
      .filter(Boolean);
    return parts.join("; ");
  }
  if (typeof record.detail === "string") return record.detail;
  return "";
}

export function redactSecret(message: string, secret: string): string {
  if (!secret) return message;
  return message.split(secret).join("[redacted]");
}
