import path from "node:path";
import { redactSecret } from "../src/lib/jev/errors";
import { recordRelay } from "./record-relay";
import { recordWalkthrough } from "./record-walkthrough";
import { withRecordingApp } from "./record-support";

const target = process.argv[2];
const mock = process.env.RECORD_MOCK === "1" || process.argv.includes("--mock");
const key = process.env.TYPESAFE_API_KEY?.trim() ?? "";
const outDir = path.join(process.cwd(), "recordings");

if (target !== "relay" && target !== "walkthrough") {
  console.error("Usage: npm run record:relay   or   npm run record:walkthrough");
  process.exit(2);
}

if (!mock && !key) {
  console.error(
    "TYPESAFE_API_KEY is not set. Run this on the machine that has the key. RECORD_MOCK=1 records the same path without calling Jev.",
  );
  process.exit(2);
}

const pageKey = mock ? "" : key;

withRecordingApp(key, async (baseURL) => {
  if (target === "relay") await recordRelay({ baseURL, mock, key: pageKey || undefined, outDir });
  else await recordWalkthrough({ baseURL, mock, key: pageKey || undefined, outDir });
}).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(redactSecret(message, key));
  process.exit(1);
});
