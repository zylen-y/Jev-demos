export function dictionaryHits(text: string, dictionary: readonly string[], limit = 8): string[] {
  const found: string[] = [];
  const lower = text.toLowerCase();
  for (const entry of dictionary) {
    const needle = entry.toLowerCase();
    const pattern = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(needle)}(?:[^a-z0-9]|$)`, "i");
    if (pattern.test(lower) && !found.some((item) => item.toLowerCase() === needle)) {
      found.push(entry);
    }
    if (found.length >= limit) break;
  }
  return found;
}

export function patternHits(text: string, pattern: RegExp, limit = 8): string[] {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const global = new RegExp(pattern.source, flags);
  const found: string[] = [];
  for (const match of text.matchAll(global)) {
    const value = match[0].replace(/\s+/g, " ").trim();
    if (!value) continue;
    if (!found.some((item) => item.toLowerCase() === value.toLowerCase())) found.push(value);
    if (found.length >= limit) break;
  }
  return found;
}

export function withNone(candidates: readonly string[]): Record<string, string> {
  const criteria: Record<string, string> = {};
  for (const candidate of candidates) {
    criteria[candidate] = `The listing text contains this span: ${candidate}`;
  }
  criteria.none = "None of the pre-parsed spans is the attribute, or the attribute is absent.";
  return criteria;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const COLOR_DICTIONARY = [
  "black",
  "white",
  "navy",
  "blue",
  "red",
  "green",
  "pink",
  "brown",
  "grey",
  "gray",
  "gold",
  "silver",
  "beige",
  "ivory",
  "charcoal",
  "olive",
  "purple",
  "orange",
  "yellow",
  "cream",
  "sage",
];

export const BRAND_DICTIONARY = [
  "Northline",
  "Kindred",
  "Lumen",
  "Oak & Kiln",
  "Acme",
  "Rolex",
  "Nike",
  "Apple",
  "Sony",
];

export const SIZE_PATTERN =
  /\b(?:xxs|xs|xl|xxl|xxxl|queen|king|twin|full|\d+(?:\.\d+)?\s?(?:cm|mm|ml|oz|in|inch|inches))\b/gi
