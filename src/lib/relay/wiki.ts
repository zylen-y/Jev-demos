export type WikiEdit = {
  id: string;
  title: string;
  wiki: string;
  summary: string;
  user: string;
  bot: boolean;
  byteDelta: number;
};

export const RELAY_BACKLOG = 2400;
export const WIKI_STREAM_URL = "https://stream.wikimedia.org/v2/stream/recentchange";

export function editFromEvent(data: unknown): WikiEdit | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  if (row.type !== "edit" && row.type !== "new") return null;
  const title = typeof row.title === "string" ? row.title.trim() : "";
  if (!title) return null;
  const wiki =
    typeof row.wiki === "string"
      ? row.wiki
      : typeof row.server_name === "string"
        ? row.server_name
        : "wiki";
  const summary = typeof row.comment === "string" ? row.comment.replace(/\s+/g, " ").trim().slice(0, 240) : "";
  const id = row.id != null ? `${wiki}:${row.id}` : `${wiki}:${title}:${String(row.timestamp ?? summary)}`;
  const length = row.length;
  let byteDelta = 0;
  if (length && typeof length === "object") {
    const oldLen = (length as { old?: unknown }).old;
    const newLen = (length as { new?: unknown }).new;
    if (typeof oldLen === "number" && typeof newLen === "number") byteDelta = newLen - oldLen;
  }
  return {
    id,
    title,
    wiki,
    summary,
    user: typeof row.user === "string" ? row.user : "",
    bot: row.bot === true,
    byteDelta,
  };
}

export function editFromApiRow(row: unknown, wiki = "enwiki"): WikiEdit | null {
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  const title = typeof record.title === "string" ? record.title.trim() : "";
  if (!title || record.type === "log" || record.type === "categorize") return null;
  const summary = typeof record.comment === "string" ? record.comment.replace(/\s+/g, " ").trim().slice(0, 240) : "";
  const id = record.rcid != null ? `${wiki}:${record.rcid}` : `${wiki}:${title}:${String(record.timestamp ?? "")}`;
  const oldLen = typeof record.oldlen === "number" ? record.oldlen : null;
  const newLen = typeof record.newlen === "number" ? record.newlen : null;
  return {
    id,
    title,
    wiki,
    summary,
    user: typeof record.user === "string" ? record.user : "",
    bot: record.bot === true,
    byteDelta: oldLen != null && newLen != null ? newLen - oldLen : 0,
  };
}

type RecentChangesPage = {
  query?: { recentchanges?: unknown[] };
  continue?: { rccontinue?: string };
};

export async function backfillWikipedia(limit: number, fetchImpl: typeof fetch = fetch): Promise<WikiEdit[]> {
  const edits: WikiEdit[] = [];
  let cursor: string | undefined;
  const pages = Math.ceil(limit / 500) + 1;
  for (let page = 0; page < pages && edits.length < limit; page += 1) {
    const url = new URL("https://en.wikipedia.org/w/api.php");
    url.searchParams.set("action", "query");
    url.searchParams.set("list", "recentchanges");
    url.searchParams.set("rcprop", "title|comment|timestamp|ids|sizes|user|flags");
    url.searchParams.set("rclimit", "500");
    url.searchParams.set("rctype", "edit|new");
    url.searchParams.set("format", "json");
    url.searchParams.set("origin", "*");
    if (cursor) url.searchParams.set("rccontinue", cursor);
    const response = await fetchImpl(url);
    if (!response.ok) break;
    const body = (await response.json()) as RecentChangesPage;
    const batch = body.query?.recentchanges ?? [];
    if (batch.length === 0) break;
    for (const row of batch) {
      const edit = editFromApiRow(row);
      if (!edit) continue;
      edits.push(edit);
      if (edits.length >= limit) break;
    }
    cursor = body.continue?.rccontinue;
    if (!cursor) break;
  }
  return edits;
}
