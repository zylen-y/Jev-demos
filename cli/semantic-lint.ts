import { readFileSync } from "node:fs";
import { evaluateSystemOne } from "../src/lib/jev/client";
import { buildLintRequest, interpretLint, type Finding } from "../src/lib/lint/rules";

const help = `Usage: npx tsx cli/semantic-lint.ts [--json] [--threshold 0.6] <files...>

Reads TYPESAFE_API_KEY from the environment. The key is sent only to the TypeSafe API.
Exit 0 when no finding is at or above the threshold, 1 when findings exist, 2 when the command cannot run.
`;

async function main() {
  const args = process.argv.slice(2);
  let threshold = 0.6;
  let json = false;
  const files: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      console.log(help);
      return;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--threshold") {
      threshold = Number(args[index + 1]);
      index += 1;
      continue;
    }
    files.push(arg);
  }
  if (!Number.isFinite(threshold)) {
    console.error("--threshold must be a number.");
    process.exitCode = 2;
    return;
  }
  const apiKey = process.env.TYPESAFE_API_KEY?.trim() ?? "";
  if (!apiKey) {
    console.error("Set TYPESAFE_API_KEY. Create one at https://console.typesafe.ai/keys");
    process.exitCode = 2;
    return;
  }
  if (files.length === 0) {
    console.error("Pass at least one file.\n");
    console.error(help);
    process.exitCode = 2;
    return;
  }

  const findings: Finding[] = [];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const response = await evaluateSystemOne({ apiKey, request: buildLintRequest(file, source) });
    const fileFindings = interpretLint(file, source, response.answers, threshold);
    findings.push(...fileFindings);
    if (!json) {
      if (fileFindings.length === 0) console.log(`${file}: no findings`);
      for (const finding of fileFindings) {
        console.log(`${finding.file}:${finding.line ?? 1}: ${finding.rule} ${(finding.probability * 100).toFixed(0)}% ${finding.message}`);
      }
    }
  }
  if (json) console.log(JSON.stringify({ findings }, null, 2));
  process.exitCode = findings.length > 0 ? 1 : 0;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Semantic lint failed.";
  console.error(message);
  process.exitCode = 2;
});
