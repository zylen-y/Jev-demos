import { choice, noul, request } from "../jev/questions";
import type { Answer, SystemOneRequest } from "../jev/types";
import { readChoice, readNoul } from "../jev/parse";

export type LintRule = {
  id: string;
  title: string;
  appliesTo: "code" | "prose";
  noul: string;
  trueWhen: string;
  falseWhen: string;
};

export const CODE_RULES: LintRule[] = [
  {
    id: "swallowed_error",
    title: "Swallowed error",
    appliesTo: "code",
    noul: "Does this source swallow an error, for example an empty catch or a catch that discards the failure without adding context?",
    trueWhen: "A failure is caught and dropped, or logged without the error and without rethrowing.",
    falseWhen: "Errors are propagated, returned, or logged with the original error attached.",
  },
  {
    id: "unowned_todo",
    title: "TODO without an owner",
    appliesTo: "code",
    noul: "Does this source contain a TODO or FIXME that does not name an owner?",
    trueWhen: "A TODO or FIXME has no person's name or handle attached.",
    falseWhen: "There is no TODO, or each one names an owner.",
  },
  {
    id: "embedded_secret",
    title: "Embedded secret",
    appliesTo: "code",
    noul: "Does this source embed a live credential, API key, password, or private token?",
    trueWhen: "A secret value appears to be hard-coded.",
    falseWhen: "Secrets are referenced through environment variables or placeholders, or there are none.",
  },
  {
    id: "hidden_side_effect",
    title: "Name hides a side effect",
    appliesTo: "code",
    noul: "Does a function whose name reads as a pure query actually charge, delete, send, or write?",
    trueWhen: "The name looks like a read, and the body mutates or sends.",
    falseWhen: "Names match the effects, or there is no such function.",
  },
];

export const PROSE_RULES: LintRule[] = [
  {
    id: "unsupported_absolute",
    title: "Unsupported absolute",
    appliesTo: "prose",
    noul: "Does this writing make an absolute claim, such as always, never, or guaranteed, without a source in the text?",
    trueWhen: "An absolute claim has no attached source.",
    falseWhen: "Absolutes are absent, or each one cites a source.",
  },
  {
    id: "missing_attribution",
    title: "Statistic without a source",
    appliesTo: "prose",
    noul: "Does this writing state a number, percentage, or quotation without saying where it came from?",
    trueWhen: "A statistic or quotation has no attribution.",
    falseWhen: "Figures are sourced, or there are no figures.",
  },
  {
    id: "guideline_voice",
    title: "Voice guideline",
    appliesTo: "prose",
    noul: "Does this writing break the team guideline that docs speak to the reader as 'you', in sentence case, without hype words such as 'revolutionary' or 'seamless'?",
    trueWhen: "The piece uses hype, title case headings, or does not address the reader as you.",
    falseWhen: "The piece follows that voice guideline.",
  },
];

export type Finding = {
  file: string;
  rule: string;
  title: string;
  line: number | null;
  probability: number;
  message: string;
};

const MAX_LINES = 60;

export function rulesFor(filename: string): LintRule[] {
  return filename.endsWith(".md") || filename.endsWith(".txt") ? PROSE_RULES : CODE_RULES;
}

export function numberedSource(source: string): { numbered: string; lineCount: number; truncated: boolean } {
  const lines = source.split(/\r?\n/);
  const truncated = lines.length > MAX_LINES;
  const kept = lines.slice(0, MAX_LINES);
  const numbered = kept.map((line, index) => `${index + 1}: ${line}`).join("\n");
  return { numbered, lineCount: kept.length, truncated };
}

export function buildLintRequest(filename: string, source: string): SystemOneRequest {
  const rules = rulesFor(filename);
  const { numbered, lineCount } = numberedSource(source);
  const lineCriteria: Record<string, string> = {
    none: "No line violates the rule.",
  };
  for (let line = 1; line <= lineCount; line += 1) {
    lineCriteria[String(line)] = `Line ${line} is the clearest violation.`;
  }
  const questions: SystemOneRequest["questions"] = {};
  for (const rule of rules) {
    questions[`${rule.id}_present`] = noul(rule.noul, { true: rule.trueWhen, false: rule.falseWhen });
    questions[`${rule.id}_line`] = choice(
      `For the rule "${rule.title}", which line is the clearest violation? Choose none if the rule is not violated. The line numbers are the prefixes in the state.`,
      lineCriteria,
    );
  }
  return request(
    {
      filename,
      guideline: rules.map((rule) => `${rule.title}: ${rule.noul}`).join("\n"),
      source: numbered,
    },
    questions,
  );
}

export function interpretLint(
  filename: string,
  source: string,
  answers: Record<string, Answer>,
  threshold: number,
): Finding[] {
  const findings: Finding[] = [];
  for (const rule of rulesFor(filename)) {
    const probability = readNoul(answers, `${rule.id}_present`);
    if (probability < threshold) continue;
    const lineChoice = readChoice(answers, `${rule.id}_line`);
    const line = lineChoice.choice === "none" ? null : Number(lineChoice.choice);
    const snippet = line && Number.isFinite(line) ? source.split(/\r?\n/)[line - 1] : undefined;
    findings.push({
      file: filename,
      rule: rule.id,
      title: rule.title,
      line: line && Number.isFinite(line) ? line : null,
      probability,
      message: snippet ? `${rule.title}. ${snippet.trim()}` : `${rule.title} somewhere in ${filename}.`,
    });
  }
  return findings;
}
