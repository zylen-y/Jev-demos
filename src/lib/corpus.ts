export type TraceKind = "succeeded" | "tool_error" | "hallucination" | "policy_issue" | "incomplete";

export type Trace = {
  id: string;
  kind: TraceKind;
  text: string;
};

export const CORPUS_SIZE = 2000;

const KINDS: TraceKind[] = ["succeeded", "tool_error", "hallucination", "policy_issue", "incomplete"];

const OPENINGS: Record<TraceKind, string[]> = {
  succeeded: [
    "The agent looked up order NL-{{n}} and found a captured charge of ${{amount}}.",
    "A shopper asked whether the linen duvet in sage was still available.",
    "The nightly reconciliation job asked the agent to confirm subscription {{n}}.",
    "Support forwarded a transcript where the customer wanted the delivery date for parcel {{n}}.",
  ],
  tool_error: [
    "The agent called get_order for NL-{{n}} and the tool returned HTTP 500.",
    "refund_payment was invoked for ${{amount}} and the gateway answered with a timeout.",
    "search_docs failed with 'index unavailable' while answering ticket {{n}}.",
    "The warehouse tool rejected the reservation for parcel {{n}} with a connection reset.",
  ],
  hallucination: [
    "The agent told the customer that order NL-{{n}} had shipped, but the tool result said it was still unpaid.",
    "No tool was called, yet the agent quoted a tracking number 1Z{{n}} that does not appear in the record.",
    "The agent claimed a refund of ${{amount}} had already been issued. The ledger shows no refund.",
    "The reply cited policy section 14.{{d}}, which is not in the handbook passed to the agent.",
  ],
  policy_issue: [
    "The customer asked for another customer's invoice and the agent pasted account {{n}} into the reply.",
    "The agent offered a 40% refund even though the policy text says only duplicate charges are refundable.",
    "A user asked the agent to ignore its rules and email the full card number on file for account {{n}}.",
    "The agent agreed to change the shipping address on order NL-{{n}} without the verification step the policy requires.",
  ],
  incomplete: [
    "The agent started searching the handbook for the return window and then stopped after the first paragraph.",
    "It called get_order for NL-{{n}} and never produced a reply to the customer.",
    "The trace ends while the agent is still deciding whether to refund ${{amount}}.",
    "A follow-up was promised and no tool call or message was written after that sentence.",
  ],
};

const MIDDLES: Record<TraceKind, string[]> = {
  succeeded: [
    "It quoted the tool result verbatim and did not add dates that were not in the payload.",
    "The reply named the carrier and the window the tool returned.",
    "It confirmed the subscription was active and listed the next invoice date from the record.",
  ],
  tool_error: [
    "The agent retried once, received the same error, and told the customer the lookup had failed.",
    "No fallback data was invented. The trace records the exception text.",
    "The stack trace shows the tool client gave up after two attempts.",
  ],
  hallucination: [
    "The invented detail was presented as if it had come from the tool.",
    "The customer-facing message and the tool payload disagree.",
    "Nothing in the retrieved policy supports the sentence the agent sent.",
  ],
  policy_issue: [
    "The handbook in the prompt forbids this disclosure.",
    "The action skips a required confirmation.",
    "The reply includes data the requester is not allowed to see.",
  ],
  incomplete: [
    "There is no final message in the trace.",
    "The plan lists two remaining steps that were never executed.",
    "The conversation ends on a tool call with no observation.",
  ],
};

const CLOSINGS: Record<TraceKind, string[]> = {
  succeeded: [
    "The customer received a complete answer grounded in the tool output.",
    "No policy exception was required.",
    "The task is done.",
  ],
  tool_error: [
    "The failure is an infrastructure error, not a wrong decision.",
    "A human was not yet paged.",
    "The customer was told to retry later.",
  ],
  hallucination: [
    "This is a fabricated fact, not a tool failure.",
    "The trace should be reviewed before the reply is trusted.",
    "The unsupported claim is the last assistant message.",
  ],
  policy_issue: [
    "This is a policy violation even though the tools succeeded.",
    "Trust and safety should see the trace.",
    "The reply should not be sent.",
  ],
  incomplete: [
    "The task was abandoned before an outcome.",
    "Treat the trace as unfinished rather than successful.",
    "There is nothing to show the customer yet.",
  ],
};

export function traceAt(index: number): Trace {
  const safe = ((index % CORPUS_SIZE) + CORPUS_SIZE) % CORPUS_SIZE;
  const kind = KINDS[safe % KINDS.length];
  const opening = OPENINGS[kind][safe % OPENINGS[kind].length];
  const middle = MIDDLES[kind][Math.floor(safe / 5) % MIDDLES[kind].length];
  const closing = CLOSINGS[kind][Math.floor(safe / 17) % CLOSINGS[kind].length];
  const n = 1000 + (safe % 9000);
  const amount = 20 + (safe % 180);
  const d = (safe % 9) + 1;
  const fill = (text: string) => text.replaceAll("{{n}}", String(n)).replaceAll("{{amount}}", String(amount)).replaceAll("{{d}}", String(d));
  return {
    id: `trace-${String(safe).padStart(4, "0")}`,
    kind,
    text: `${fill(opening)} ${fill(middle)} ${fill(closing)}`,
  };
}

export function corpusSlice(count: number, offset = 0): Trace[] {
  const size = Math.max(0, Math.min(CORPUS_SIZE, count));
  return Array.from({ length: size }, (_, index) => traceAt(offset + index));
}

export function kindCounts(traces: readonly Trace[]): Record<TraceKind, number> {
  const counts: Record<TraceKind, number> = {
    succeeded: 0,
    tool_error: 0,
    hallucination: 0,
    policy_issue: 0,
    incomplete: 0,
  };
  for (const trace of traces) counts[trace.kind] += 1;
  return counts;
}
