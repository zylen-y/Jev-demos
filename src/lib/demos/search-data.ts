import { choice, noul, request, score } from "../jev/questions";
import type { SystemOneRequest } from "../jev/types";

export type Passage = { id: string; title: string; text: string };

export const PASSAGES: Passage[] = [
  { id: "p1", title: "Duplicate charges", text: "A duplicate captured charge is refunded to the original payment method within 30 days of the second capture." },
  { id: "p2", title: "Change of mind", text: "Change-of-mind returns become store credit. They are not refunded to the card. The window is 30 days and the item must be unused." },
  { id: "p3", title: "Shipping", text: "Linen ships from Porto. Standard delivery is five business days inside the continental US. Expedited shipping is two days." },
  { id: "p4", title: "Outages", text: "API outages are reported on the status page. A captured charge with no order is refunded. Downtime itself is not a cash refund." },
  { id: "p5", title: "Accounts", text: "Support will not email a full card number or a password. Account changes require the email on file." },
  { id: "p6", title: "Plans", text: "The enterprise plan includes a named on-call contact. The starter plan is email support within one business day." },
  { id: "p7", title: "Privacy", text: "Customer content sent to Jev is not used to train Jev. Enterprise accounts can request zero data retention." },
  { id: "p8", title: "Expenses", text: "Employees may expense a desk lamp up to $80 with a receipt. Software over $50 needs a manager." },
];

const relevance = ["Unrelated to the query", "Mentions a nearby topic", "Answers the query directly"] as const;

export function searchRequest(query: string, passages: Passage[] = PASSAGES): SystemOneRequest {
  const questions: SystemOneRequest["questions"] = {
    answered: noul("Do any of the passages in `passages` contain an answer to `query`?", {
      true: "At least one passage answers it.",
      false: "The handbook does not contain an answer.",
    }),
  };
  for (const passage of passages) {
    questions[`rel_${passage.id}`] = score(
      `Cross-encode this pair. How well does the passage titled "${passage.title}" answer \`query\`? Judge that passage only: ${passage.text}`,
      [...relevance],
    );
  }
  return request({ query, passages }, questions);
}

export function pairwiseRequest(query: string, left: Passage, right: Passage): SystemOneRequest {
  return request(
    { query, left, right },
    {
      better: choice(
        "Which passage answers `query` better? Compare the two texts directly.",
        {
          [left.id]: left.text,
          [right.id]: right.text,
          tie: "They are equally useful or equally useless.",
        },
      ),
    },
  );
}
