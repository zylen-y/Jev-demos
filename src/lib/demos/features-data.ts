import { noul, request } from "../jev/questions";
import type { SystemOneRequest } from "../jev/types";

export type ReviewRow = {
  id: string;
  text: string;
  priorPurchases: number;
  bought: 0 | 1;
};

export const FEATURE_BANK = [
  { id: "purchase_intent", instruction: "Does the writer intend to buy this product soon?" },
  { id: "urgency", instruction: "Does the writer need the product by a deadline or for an imminent event?" },
  { id: "price_objection", instruction: "Is price the reason they are hesitating or refusing?" },
  { id: "competitor", instruction: "Does the writer compare the product with a competitor they might buy instead?" },
  { id: "praise", instruction: "Does the writer praise a specific product attribute?" },
  { id: "return_risk", instruction: "Does the writer describe a defect, a return, or a reason not to keep the product?" },
] as const;

export const REVIEWS: ReviewRow[] = [
  { id: "r1", priorPurchases: 3, bought: 1, text: "Hold two sage queen covers for me. I need them before the Friday market and I will pay the rush fee." },
  { id: "r2", priorPurchases: 0, bought: 0, text: "The clasp broke after one wear. I want a refund, not another one. Do not send a replacement." },
  { id: "r3", priorPurchases: 1, bought: 1, text: "Adding a second lamp to the order. Please ship both to the studio address you have." },
  { id: "r4", priorPurchases: 0, bought: 0, text: "I might look again next year. Right now the rent is due and this is not the month." },
  { id: "r5", priorPurchases: 4, bought: 1, text: "Same linen as last spring, ivory this time, king. Checkout is open on my side." },
  { id: "r6", priorPurchases: 2, bought: 0, text: "Beautiful photos. I bought the cheaper one from Harbor Home instead because this is twice the price." },
  { id: "r7", priorPurchases: 0, bought: 1, text: "Wedding is in three weeks. If the napkins can arrive by the 12th I will place the order today." },
  { id: "r8", priorPurchases: 1, bought: 0, text: "Color is nothing like the picture. Returning the set. Please email the label." },
  { id: "r9", priorPurchases: 5, bought: 1, text: "Reorder of the stoneware bowls, two more of the large. You can charge the card on file." },
  { id: "r10", priorPurchases: 0, bought: 0, text: "Just browsing for a friend's birthday. No decision. Please stop the discount popups." },
  { id: "r11", priorPurchases: 2, bought: 1, text: "I'll take the navy tote if it is still in stock. Need it for a trip on Monday." },
  { id: "r12", priorPurchases: 3, bought: 0, text: "We already purchased the Oak & Kiln version. Writing to say yours looks similar, not to buy." },
  { id: "r13", priorPurchases: 0, bought: 1, text: "Please invoice the studio. We are furnishing four rooms and this duvet is the one we picked." },
  { id: "r14", priorPurchases: 1, bought: 0, text: "The seam split in the wash. I will not buy from this line again until that is fixed." },
  { id: "r15", priorPurchases: 6, bought: 1, text: "Back again for the usual. Add the beeswax candles, the large size, to my usual monthly order." },
  { id: "r16", priorPurchases: 0, bought: 0, text: "Is this wool or a blend? Asking for a school project, not purchasing." },
  { id: "r17", priorPurchases: 2, bought: 1, text: "Guest room has to be ready Thursday. If you can overnight the cover, consider it sold." },
  { id: "r18", priorPurchases: 1, bought: 0, text: "Too expensive for what it is, and the competitor includes the shams. Passing." },
  { id: "r19", priorPurchases: 0, bought: 1, text: "First order. I want the olive apron and the matching towel. Shipping to Portland." },
  { id: "r20", priorPurchases: 4, bought: 0, text: "Loved the last blanket. This batch smells like solvent and I'm sending it back." },
  { id: "r21", priorPurchases: 3, bought: 1, text: "Team offsite next week. We need twelve mugs. I can pay by wire today." },
  { id: "r22", priorPurchases: 0, bought: 0, text: "Not buying. The description never says the fabric weight, so I don't trust it." },
  { id: "r23", priorPurchases: 2, bought: 1, text: "Replace the one I gave my sister. She wants the same red, medium. I'll check out after this note." },
  { id: "r24", priorPurchases: 1, bought: 0, text: "Please cancel the restock alert. I bought something else and I don't want this anymore." },
];

export function featureRequest(text: string, priorPurchases: number, customInstruction: string): SystemOneRequest {
  const questions: SystemOneRequest["questions"] = {
    custom_feature: noul(customInstruction, {
      true: "The statement is true of `text`.",
      false: "The statement is false of `text`.",
    }),
  };
  for (const feature of FEATURE_BANK) {
    questions[feature.id] = noul(feature.instruction, {
      true: "Yes, for the text in `text`.",
      false: "No, for the text in `text`.",
    });
  }
  return request({ text, prior_purchases: priorPurchases }, questions);
}
