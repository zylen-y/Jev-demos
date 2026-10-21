import { noul, request, score, choice } from "../jev/questions";
import type { SystemOneRequest } from "../jev/types";

/** Weekly units for the Northline sage duvet. */
export const WEEKLY_DEMAND = [42, 45, 40, 48, 51, 47, 53, 58, 55, 62, 60, 66, 70, 68, 74, 71];

export const FORECAST_NOTES = {
  inquiries:
    "Twelve emails this week ask if the sage queen can arrive before a wedding on the 18th. Three ask for a bulk quote for a hotel renovation next month.",
  sales:
    "Rep note: the Portland shop wants a standing order if we can promise stock. They lost a weekend of sales when we were short last month.",
  reviews:
    "Recent reviews praise the stonewash and complain that ivory is backordered. Nobody is asking for the grey colorway.",
  tickets:
    "Support saw a cluster of 'when will sage restock' tickets. Two customers said they would buy from Harbor Home if we slip another week.",
  market:
    "A trade note says linen prices ticked up and a competitor launched a cheaper sateen cover aimed at the same wedding season.",
};

export function forecastRequest(): SystemOneRequest {
  return request(FORECAST_NOTES, {
    purchase_intent: noul("Across these notes, is there near-term purchase intent for the sage duvet?", {
      true: "People are trying to buy soon.",
      false: "Demand is idle or only curious.",
    }),
    urgency: noul("Do the notes describe urgency, such as an event date or a stockout?", {
      true: "There is time pressure.",
      false: "There is no time pressure.",
    }),
    interest: score("How strong is product interest in the sage duvet, as opposed to other goods?", [
      "Little interest",
      "Ordinary interest",
      "Interest is concentrated on this product",
    ]),
    supply: noul("Do the notes describe a supply constraint that could cap sales?", {
      true: "Stock, lead time, or cost is a constraint.",
      false: "Supply looks fine.",
    }),
    competition: noul("Do the notes describe competitive pressure that could pull demand away?", {
      true: "A competitor is taking or threatening demand.",
      false: "Competitors are not a factor here.",
    }),
    theme: choice("What emerging demand theme shows up most clearly?", {
      weddings: "Events and weddings",
      wholesale: "A shop or hotel order",
      restock: "People waiting on a restock",
      other: "Something else",
    }),
  });
}
