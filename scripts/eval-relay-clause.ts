import { redactSecret } from "../src/lib/jev/errors";
import { evaluateSystemOneMany } from "../src/lib/jev/client";
import { parseSystemOneResponse } from "../src/lib/jev/parse";
import { CLAUSE_SAMPLES } from "../src/lib/relay/clause-samples";
import { scoreClause } from "../src/lib/relay/clause-eval";
import { addedClauseRequest, clauseApplies, RECORD_POLICY } from "../src/lib/relay/judge";

const key = process.env.TYPESAFE_API_KEY?.trim() ?? "";

if (!key) {
  console.error("TYPESAFE_API_KEY is not set. Run this on the machine that has the key. The eval does not call Jev without it.");
  process.exit(2);
}

async function main(): Promise<void> {
  const requests = CLAUSE_SAMPLES.map((sample) => addedClauseRequest(sample.edit, RECORD_POLICY));
  const results = await evaluateSystemOneMany({ apiKey: key, requests, timeoutMs: 8_000, maxRetries: 2 });
  const scored: { aboutElection: boolean; predicted: boolean }[] = [];
  let failed = 0;
  results.forEach((result, index) => {
    const sample = CLAUSE_SAMPLES[index];
    if (!sample) return;
    if (result.status !== 200) {
      failed += 1;
      return;
    }
    try {
      const response = parseSystemOneResponse(result.body);
      const answer = response.answers.rule_applies;
      if (!answer || answer.type !== "noul") {
        failed += 1;
        return;
      }
      scored.push({ aboutElection: sample.aboutElection, predicted: clauseApplies(answer.noul) });
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(redactSecret(message, key));
    }
  });
  if (scored.length === 0) {
    console.error(`No clause answers came back. ${failed} calls failed.`);
    process.exit(1);
  }
  const score = scoreClause(scored);
  const precision = score.precision == null ? "n/a" : score.precision.toFixed(3);
  const recall = score.recall == null ? "n/a" : score.recall.toFixed(3);
  console.log(`samples ${CLAUSE_SAMPLES.length}`);
  console.log(`scored ${scored.length}`);
  console.log(`failed ${failed}`);
  console.log(`tp ${score.tp} fp ${score.fp} fn ${score.fn} tn ${score.tn}`);
  console.log(`precision ${precision}`);
  console.log(`recall ${recall}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(redactSecret(message, key));
  process.exit(1);
});
