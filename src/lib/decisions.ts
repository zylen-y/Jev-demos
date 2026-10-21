import { clamp } from "./format";

export type Tone = "go" | "review" | "stop" | "neutral";

export type Step = {
  label: string;
  detail: string;
  status: "taken" | "skipped";
};

export type RouteDecision = {
  destination: string;
  headline: string;
  tone: Tone;
  summary: string;
  steps: Step[];
};

function step(label: string, detail: string, taken: boolean): Step {
  return { label, detail, status: taken ? "taken" : "skipped" };
}

export type AutomationInput = {
  department: string;
  departmentConfidence: number;
  urgency: number;
  refundRequested: number;
  jailbreak: number;
  sensitiveData: number;
};

export type AutomationThresholds = {
  urgency: number;
  jailbreak: number;
  autoConfidence: number;
  refund: number;
  sensitive: number;
};

export const automationThresholds: AutomationThresholds = {
  urgency: 0.75,
  jailbreak: 0.55,
  autoConfidence: 0.62,
  refund: 0.7,
  sensitive: 0.7,
};

export function decideAutomation(input: AutomationInput, thresholds: AutomationThresholds): RouteDecision {
  const refuse = input.jailbreak >= thresholds.jailbreak;
  const privacy = !refuse && input.sensitiveData >= thresholds.sensitive;
  const autoRefund =
    !refuse &&
    !privacy &&
    input.department === "billing" &&
    input.refundRequested >= thresholds.refund &&
    input.departmentConfidence >= thresholds.autoConfidence;
  const uncertainUrgent =
    !refuse && !privacy && !autoRefund && input.urgency >= thresholds.urgency && input.departmentConfidence < thresholds.autoConfidence;
  const urgent =
    !refuse && !privacy && !autoRefund && !uncertainUrgent && input.urgency >= thresholds.urgency;
  const destination = refuse
    ? "refuse"
    : privacy
      ? "privacy-review"
      : autoRefund
        ? "refund-workflow"
        : uncertainUrgent
          ? "human-triage"
          : urgent
            ? `${input.department}-urgent`
            : `${input.department}-standard`;
  const tone: Tone = refuse ? "stop" : privacy || uncertainUrgent ? "review" : "go";
  return {
    destination,
    tone,
    headline: headlineFor(destination),
    summary: "Code reads the probabilities and chooses the branch. Jev does not choose the workflow.",
    steps: [
      step("Jailbreak", `p=${input.jailbreak.toFixed(2)} vs ${thresholds.jailbreak}`, refuse),
      step("Sensitive data", `p=${input.sensitiveData.toFixed(2)} vs ${thresholds.sensitive}`, privacy),
      step(
        "Auto refund",
        `${input.department} refund p=${input.refundRequested.toFixed(2)}, confidence ${input.departmentConfidence.toFixed(2)}`,
        autoRefund,
      ),
      step("Uncertain and urgent", `urgency ${input.urgency.toFixed(2)}, confidence ${input.departmentConfidence.toFixed(2)}`, uncertainUrgent),
      step("Urgent queue", `urgency ${input.urgency.toFixed(2)}`, urgent),
      step("Standard queue", input.department, destination.endsWith("standard")),
    ],
  };
}

export type RouterInput = {
  intent: string;
  intentConfidence: number;
  domain: string;
  difficulty: number;
  risk: number;
};

export type RouterThresholds = {
  risk: number;
  hard: number;
  standard: number;
  confidence: number;
};

export const routerThresholds: RouterThresholds = {
  risk: 0.62,
  hard: 0.72,
  standard: 0.4,
  confidence: 0.5,
};

export function decideRouter(input: RouterInput, thresholds: RouterThresholds): RouteDecision {
  const reasoning = input.risk >= thresholds.risk || input.difficulty >= thresholds.hard;
  const standard = !reasoning && (input.difficulty >= thresholds.standard || input.intentConfidence < thresholds.confidence);
  const fast = !reasoning && !standard;
  const destination = reasoning ? "reasoning-model" : standard ? "standard-model" : "fast-model";
  return {
    destination,
    tone: reasoning ? "review" : "go",
    headline: reasoning ? "Escalate to the reasoning model" : standard ? "Send to the standard model" : "Send to the fast model",
    summary: `${input.intent} · ${input.domain}. Thresholds are yours to edit.`,
    steps: [
      step("Risk or hard difficulty", `risk ${input.risk.toFixed(2)}, difficulty ${input.difficulty.toFixed(2)}`, reasoning),
      step("Ambiguous or mid difficulty", `confidence ${input.intentConfidence.toFixed(2)}`, standard),
      step("Cheap path", "clear, low-risk, easy", fast),
    ],
  };
}

export type ModerationInput = {
  toxicity: number;
  harassment: number;
  spam: number;
  fraud: number;
  unsafeAdvice: number;
  personalData: number;
  optOut: number;
  policyViolation: number;
  severity: number;
  severityConfidence: number;
};

export type ModerationThresholds = {
  blockHarm: number;
  blockSeverity: number;
  blockConfidence: number;
  warnHarm: number;
  warnSeverity: number;
  reviewHarm: number;
  reviewConfidence: number;
  optOut: number;
};

export const moderationThresholds: ModerationThresholds = {
  blockHarm: 0.72,
  blockSeverity: 0.66,
  blockConfidence: 0.55,
  warnHarm: 0.45,
  warnSeverity: 0.4,
  reviewHarm: 0.4,
  reviewConfidence: 0.45,
  optOut: 0.65,
};

export type ModerationAction = "allow" | "warn" | "review" | "block" | "opt-out";

export function harmScore(input: ModerationInput): number {
  return Math.max(
    input.toxicity,
    input.harassment,
    input.spam,
    input.fraud,
    input.unsafeAdvice,
    input.personalData,
    input.policyViolation,
  );
}

export function decideModeration(input: ModerationInput, thresholds: ModerationThresholds): RouteDecision & { action: ModerationAction } {
  const harm = harmScore(input);
  const optOut = input.optOut >= thresholds.optOut;
  const block =
    !optOut &&
    harm >= thresholds.blockHarm &&
    input.severity >= thresholds.blockSeverity &&
    input.severityConfidence >= thresholds.blockConfidence;
  const warn = !optOut && !block && harm >= thresholds.warnHarm && input.severity >= thresholds.warnSeverity;
  const review = !optOut && !block && !warn && (harm >= thresholds.reviewHarm || input.severityConfidence < thresholds.reviewConfidence);
  const action: ModerationAction = optOut ? "opt-out" : block ? "block" : warn ? "warn" : review ? "review" : "allow";
  const tone: Tone = action === "block" ? "stop" : action === "allow" ? "go" : "review";
  return {
    action,
    destination: action,
    tone,
    headline:
      action === "opt-out"
        ? "Honor the opt-out and confirm suppression"
        : action === "block"
          ? "Block"
          : action === "warn"
            ? "Warn"
            : action === "review"
              ? "Send to review"
              : "Allow",
    summary: `Harm ${harm.toFixed(2)} · severity ${input.severity.toFixed(2)} · confidence ${input.severityConfidence.toFixed(2)}.`,
    steps: [
      step("Opt-out", `p=${input.optOut.toFixed(2)}`, optOut),
      step("Block", `harm ${harm.toFixed(2)}, severity ${input.severity.toFixed(2)}, confidence ${input.severityConfidence.toFixed(2)}`, block),
      step("Warn", `harm ${harm.toFixed(2)}, severity ${input.severity.toFixed(2)}`, warn),
      step("Review", "elevated harm or low confidence", review),
      step("Allow", "below every threshold", action === "allow"),
    ],
  };
}

export type ClaimInput = {
  peril: string;
  perilConfidence: number;
  complexity: number;
  missing: number;
  fraud: number;
};

export type ClaimThresholds = {
  fraud: number;
  missing: number;
  straightThrough: number;
  confidence: number;
};

export const claimThresholds: ClaimThresholds = {
  fraud: 0.58,
  missing: 0.6,
  straightThrough: 0.38,
  confidence: 0.6,
};

export function decideClaim(input: ClaimInput, thresholds: ClaimThresholds): RouteDecision {
  const escalate = input.fraud >= thresholds.fraud || input.perilConfidence < thresholds.confidence;
  const needsInfo = !escalate && input.missing >= thresholds.missing;
  const straight = !escalate && !needsInfo && input.complexity <= thresholds.straightThrough && input.fraud < 0.35;
  const destination = escalate ? "specialist-adjuster" : needsInfo ? "request-info" : straight ? "straight-through" : "specialist-queue";
  return {
    destination,
    tone: escalate ? "stop" : straight ? "go" : "review",
    headline: headlineFor(destination),
    summary: `${input.peril} claim. Complexity, missing facts, and fraud indicators stay separate so the threshold for each can move.`,
    steps: [
      step("Fraud or low confidence", `fraud ${input.fraud.toFixed(2)}, confidence ${input.perilConfidence.toFixed(2)}`, escalate),
      step("Missing information", `p=${input.missing.toFixed(2)}`, needsInfo),
      step("Straight-through", `complexity ${input.complexity.toFixed(2)}`, straight),
      step("Specialist queue", "too complex for straight-through", destination === "specialist-queue"),
    ],
  };
}

export type GuardrailInput = {
  jailbreak: number;
  injection: number;
  inputPolicy: number;
  inputSensitive: number;
  outputPolicy: number;
  outputSensitive: number;
  qualityFailure: number;
  toolError: number;
};

export type GuardrailThresholds = { block: number; review: number };

export const guardrailThresholds: GuardrailThresholds = { block: 0.7, review: 0.4 };

export function decideGuardrails(input: GuardrailInput, thresholds: GuardrailThresholds): RouteDecision {
  const checks = [
    ["jailbreak", input.jailbreak],
    ["prompt injection", input.injection],
    ["input policy", input.inputPolicy],
    ["input sensitive data", input.inputSensitive],
    ["output policy", input.outputPolicy],
    ["output sensitive data", input.outputSensitive],
    ["response quality", input.qualityFailure],
    ["tool-call error", input.toolError],
  ] as const;
  const worst = checks.reduce((best, item) => (item[1] > best[1] ? item : best));
  const block = worst[1] >= thresholds.block;
  const review = !block && worst[1] >= thresholds.review;
  const destination = block ? "block" : review ? "review" : "pass";
  return {
    destination,
    tone: block ? "stop" : review ? "review" : "go",
    headline: block ? `Block · ${worst[0]}` : review ? `Review · ${worst[0]}` : "Pass",
    summary: "Every check is a probability you can log. The action is a threshold in code.",
    steps: checks.map(([label, value]) => step(label, `p=${value.toFixed(2)}`, value >= thresholds.review)),
  };
}

export function composite(parts: { value: number; weight: number }[]): number {
  const weight = parts.reduce((sum, part) => sum + part.weight, 0);
  if (weight <= 0) return 0;
  return clamp(
    parts.reduce((sum, part) => sum + part.value * part.weight, 0) / weight,
    0,
    1,
  );
}

export type RecruitingInput = {
  experience: number[];
  competencies: number[];
  match: string;
  matchConfidence: number;
};

export type RecruitingThresholds = { manager: number; recruiter: number; confidence: number };

export const recruitingThresholds: RecruitingThresholds = { manager: 0.72, recruiter: 0.48, confidence: 0.55 };

export function decideRecruiting(input: RecruitingInput, thresholds: RecruitingThresholds): RouteDecision & { matchScore: number } {
  const matchScore = composite([
    ...input.experience.map((value) => ({ value, weight: 1 })),
    ...input.competencies.map((value) => ({ value, weight: 1.2 })),
    { value: input.match === "strong" ? 1 : input.match === "partial" ? 0.55 : 0.15, weight: 1.4 },
  ]);
  const uncertain = input.matchConfidence < thresholds.confidence;
  const manager = !uncertain && matchScore >= thresholds.manager;
  const recruiter = !uncertain && !manager && matchScore >= thresholds.recruiter;
  const destination = uncertain ? "human-review" : manager ? "hiring-manager" : recruiter ? "recruiter-screen" : "talent-pool";
  return {
    matchScore,
    destination,
    tone: uncertain ? "review" : manager ? "go" : "neutral",
    headline: headlineFor(destination),
    summary: `Composite match ${(matchScore * 100).toFixed(0)} from experience, competency scores, and the role-fit choice.`,
    steps: [
      step("Uncertain match", `confidence ${input.matchConfidence.toFixed(2)}`, uncertain),
      step("Hiring manager", `score ${matchScore.toFixed(2)}`, manager),
      step("Recruiter screen", `score ${matchScore.toFixed(2)}`, recruiter),
      step("Talent pool", "below the recruiter line", destination === "talent-pool"),
    ],
  };
}

export type LeadScore = {
  id: string;
  name: string;
  industry: number;
  maturity: number;
  relevance: number;
  pain: number;
  intent: number;
};

export function scoreLead(lead: LeadScore): number {
  return composite([
    { value: lead.industry, weight: 1 },
    { value: lead.maturity, weight: 0.6 },
    { value: lead.relevance, weight: 1.2 },
    { value: lead.pain, weight: 1 },
    { value: lead.intent, weight: 1.4 },
  ]);
}

export function routeLead(score: number, intent: number): { destination: string; tone: Tone } {
  if (score >= 0.62 && intent >= 0.55) return { destination: "account-executive", tone: "go" };
  if (score >= 0.4) return { destination: "nurture", tone: "review" };
  return { destination: "disqualify", tone: "neutral" };
}

export type SupportInput = {
  issue: string;
  product: string;
  intent: string;
  urgency: number;
  frustration: number;
  churn: number;
  refund: number;
  draftPolicy: number;
  draftAnswers: number;
  followUp: string;
};

export function decideSupport(input: SupportInput): RouteDecision {
  const retention = input.churn >= 0.6 || input.frustration >= 0.7;
  const billing = input.issue === "billing" || input.intent === "refund" || input.intent === "cancel";
  const trust = input.issue === "abuse";
  const destination = trust ? "trust-and-safety" : retention ? "retention" : billing ? "billing" : input.issue === "outage" ? "technical-urgent" : "general";
  const draftBlocked = input.draftPolicy < 0.45 || input.draftAnswers < 0.45;
  return {
    destination,
    tone: draftBlocked || retention ? "review" : "go",
    headline: draftBlocked ? `${headlineFor(destination)} · hold the draft` : headlineFor(destination),
    summary: draftBlocked
      ? "The draft misses the policy or the request, so code holds it."
      : `Follow-up owned by ${input.followUp}.`,
    steps: [
      step("Trust queue", input.issue, trust),
      step("Retention", `churn ${input.churn.toFixed(2)}, frustration ${input.frustration.toFixed(2)}`, retention && !trust),
      step("Billing", input.intent, billing && !trust && !retention),
      step("Draft allowed", `policy ${input.draftPolicy.toFixed(2)}, answers ${input.draftAnswers.toFixed(2)}`, !draftBlocked),
    ],
  };
}

export type CrimeInput = {
  suspicion: number;
  sameEntity: number;
  evidence: number;
  relevance: number;
};

export function decideCrime(input: CrimeInput): RouteDecision {
  const ambiguousEntity = input.sameEntity >= 0.35 && input.sameEntity < 0.75;
  const priority = input.suspicion >= 0.6 && input.evidence >= 0.55 && input.relevance >= 0.5;
  const close = input.suspicion < 0.32 && input.relevance < 0.4 && !ambiguousEntity;
  const destination = close ? "close-alert" : priority ? "priority-investigator" : "investigator-review";
  return {
    destination,
    tone: close ? "go" : priority ? "stop" : "review",
    headline: headlineFor(destination),
    summary: ambiguousEntity
      ? "The entity match is ambiguous, so a person compares the records."
      : `Suspicion ${input.suspicion.toFixed(2)} with evidence ${input.evidence.toFixed(2)}.`,
    steps: [
      step("Close", `suspicion ${input.suspicion.toFixed(2)}`, close),
      step("Ambiguous entity", `same-entity p=${input.sameEntity.toFixed(2)}`, ambiguousEntity),
      step("Priority", `suspicion ${input.suspicion.toFixed(2)}, evidence ${input.evidence.toFixed(2)}`, priority),
      step("Investigator", "default review", destination === "investigator-review"),
    ],
  };
}

export type LegalInput = {
  docType: string;
  docConfidence: number;
  missing: number;
  prohibited: number;
  violation: number;
  requirements: number[];
};

export function decideLegal(input: LegalInput): RouteDecision {
  const failedRequirement = input.requirements.some((value) => value < 0.45);
  const escalate = input.prohibited >= 0.5 || input.violation >= 0.55 || input.missing >= 0.6 || failedRequirement || input.docConfidence < 0.45;
  return {
    destination: escalate ? "counsel" : "file",
    tone: escalate ? "stop" : "go",
    headline: escalate ? "Escalate to counsel" : "File",
    summary: `${input.docType}. ${input.requirements.length} explicit requirements checked.`,
    steps: [
      step("Prohibited or policy", `prohibited ${input.prohibited.toFixed(2)}, violation ${input.violation.toFixed(2)}`, input.prohibited >= 0.5 || input.violation >= 0.55),
      step("Missing clause", `p=${input.missing.toFixed(2)}`, input.missing >= 0.6),
      step("Requirement failed", failedRequirement ? "at least one requirement is below 0.45" : "all requirements hold", failedRequirement),
      step("Low confidence", input.docConfidence.toFixed(2), input.docConfidence < 0.45),
    ],
  };
}

export type ListingInput = {
  category: string;
  categoryConfidence: number;
  prohibited: number;
  counterfeit: number;
  reviewAbuse: number;
  quality: number;
};

export function decideListing(input: ListingInput): RouteDecision & { rank: number } {
  const block = input.prohibited >= 0.6 || input.counterfeit >= 0.6;
  const review = !block && (input.categoryConfidence < 0.5 || input.reviewAbuse >= 0.5);
  const rank = clamp(input.quality * (1 - 0.5 * input.reviewAbuse) * (block ? 0 : 1), 0, 1);
  const destination = block ? "remove" : review ? "human-review" : "publish";
  return {
    rank,
    destination,
    tone: block ? "stop" : review ? "review" : "go",
    headline: block ? "Remove the listing" : review ? "Route for review" : "Publish",
    summary: `${input.category}. Rank score ${(rank * 100).toFixed(0)} from quality, discounted for review abuse.`,
    steps: [
      step("Prohibited or counterfeit", `prohibited ${input.prohibited.toFixed(2)}, counterfeit ${input.counterfeit.toFixed(2)}`, block),
      step("Uncertain category or review abuse", `confidence ${input.categoryConfidence.toFixed(2)}`, review),
      step("Publish", "clear listing", destination === "publish"),
    ],
  };
}

export type AdInput = {
  brandSafety: string;
  audience: number;
  regulated: number;
  prohibited: number;
  quality: number;
  alignment: number;
};

export function decideAd(input: AdInput): RouteDecision {
  const reject = input.brandSafety === "unsafe" || input.prohibited >= 0.55 || input.regulated >= 0.6;
  const revise = !reject && (input.alignment < 0.5 || input.quality < 0.4 || input.audience < 0.35);
  const destination = reject ? "reject" : revise ? "revise" : "approve";
  return {
    destination,
    tone: reject ? "stop" : revise ? "review" : "go",
    headline: headlineFor(destination),
    summary: `Brand safety ${input.brandSafety}. Alignment ${input.alignment.toFixed(2)}.`,
    steps: [
      step("Reject", `safety ${input.brandSafety}, claims ${Math.max(input.prohibited, input.regulated).toFixed(2)}`, reject),
      step("Revise", `alignment ${input.alignment.toFixed(2)}, quality ${input.quality.toFixed(2)}`, revise),
      step("Approve", "safe, aligned, adequate quality", destination === "approve"),
    ],
  };
}

export type PlayerInput = {
  abuse: number;
  toxicity: number;
  suspicious: number;
  frustration: number;
  engagement: number;
  churn: number;
  reportType: string;
};

export function decidePlayer(input: PlayerInput): RouteDecision {
  const moderation = input.abuse >= 0.6 || input.toxicity >= 0.65 || input.suspicious >= 0.7;
  const retention = !moderation && input.churn >= 0.55;
  const destination = moderation ? "moderation" : retention ? "retention" : input.reportType === "bug" ? "technical" : "player-support";
  return {
    destination,
    tone: moderation ? "stop" : retention ? "review" : "go",
    headline: headlineFor(destination),
    summary: `Frustration ${input.frustration.toFixed(2)} · engagement ${input.engagement.toFixed(2)} · churn ${input.churn.toFixed(2)}.`,
    steps: [
      step("Moderation", `abuse ${input.abuse.toFixed(2)}, toxicity ${input.toxicity.toFixed(2)}`, moderation),
      step("Retention", `churn ${input.churn.toFixed(2)}`, retention),
      step("Support queue", destination, !moderation && !retention),
    ],
  };
}

export type RiskInput = {
  riskType: string;
  suspicious: number;
  severity: number;
  controlWeakness: number;
  velocity: number;
  disclosureGap: number;
};

export function decideRisk(input: RiskInput): RouteDecision & { priority: number; features: { name: string; value: number }[] } {
  const features = [
    { name: "suspicious", value: input.suspicious },
    { name: "severity", value: input.severity },
    { name: "control_weakness", value: input.controlWeakness },
    { name: "velocity", value: input.velocity },
    { name: "disclosure_gap", value: input.disclosureGap },
  ];
  const priority = composite(features.map((feature) => ({ value: feature.value, weight: feature.name === "severity" ? 1.4 : 1 })));
  const destination = priority >= 0.7 ? "underwriter-now" : priority >= 0.4 ? "underwriter-queue" : "monitor";
  return {
    features,
    priority,
    destination,
    tone: priority >= 0.7 ? "stop" : priority >= 0.4 ? "review" : "go",
    headline: headlineFor(destination),
    summary: `${input.riskType}. Priority ${(priority * 100).toFixed(0)} is a weighted sum of the feature vector.`,
    steps: [
      step("Immediate review", priority.toFixed(2), destination === "underwriter-now"),
      step("Queue", priority.toFixed(2), destination === "underwriter-queue"),
      step("Monitor", priority.toFixed(2), destination === "monitor"),
    ],
  };
}

export type ScreenInput = {
  inclusion: number[];
  exclusion: number[];
};

export function decideScreen(input: ScreenInput): RouteDecision {
  const include = input.inclusion.every((value) => value >= 0.55) && input.exclusion.every((value) => value < 0.45);
  const exclude = input.exclusion.some((value) => value >= 0.6) || input.inclusion.some((value) => value < 0.3);
  const destination = include ? "include" : exclude ? "exclude" : "full-text-review";
  return {
    destination,
    tone: include ? "go" : exclude ? "stop" : "review",
    headline: headlineFor(destination),
    summary: "Inclusion and exclusion stay as separate probabilities. Code applies the review protocol.",
    steps: [
      step("Include", "every inclusion criterion holds and no exclusion does", include),
      step("Exclude", "an exclusion fired or an inclusion failed clearly", exclude && !include),
      step("Full text", "the abstract is not decisive", destination === "full-text-review"),
    ],
  };
}

export type HarnessInput = {
  jailbreak: number;
  difficulty: number;
  risk: number;
  intentConfidence: number;
  intent: string;
  domain: string;
  passageScores: number[];
  draftPolicy: number;
  draftAnswers: number;
  toolOk: number;
  reasoning: string;
};

export function decideHarness(input: HarnessInput, thresholds: RouterThresholds & { context: number; guard: number }): RouteDecision & { contextIndexes: number[] } {
  if (input.jailbreak >= 0.55) {
    return {
      destination: "refuse",
      tone: "stop",
      headline: "Refuse before any model call",
      summary: "The harness checks the prompt before it spends a generation.",
      contextIndexes: [],
      steps: [step("Jailbreak", input.jailbreak.toFixed(2), true)],
    };
  }
  const routed = decideRouter(
    {
      intent: input.intent,
      intentConfidence: input.intentConfidence,
      domain: input.domain,
      difficulty: input.difficulty,
      risk: input.risk,
    },
    thresholds,
  );
  const contextIndexes = input.passageScores
    .map((score, index) => ({ score, index }))
    .filter((item) => item.score >= thresholds.context)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.index);
  const guard = input.draftPolicy < thresholds.guard || input.draftAnswers < thresholds.guard || input.toolOk < thresholds.guard;
  const reasoningBad = input.reasoning !== "sound";
  return {
    destination: guard || reasoningBad ? `${routed.destination}+hold` : routed.destination,
    tone: guard || reasoningBad ? "review" : routed.tone,
    headline: guard || reasoningBad ? `${routed.headline}, then hold the draft` : routed.headline,
    summary: `${contextIndexes.length} passages cleared the context threshold. Reasoning trace: ${input.reasoning}.`,
    contextIndexes,
    steps: [
      ...routed.steps,
      step("Context kept", contextIndexes.map((index) => `#${index + 1}`).join(", ") || "none", contextIndexes.length > 0),
      step("Draft and tool", `policy ${input.draftPolicy.toFixed(2)}, tool ${input.toolOk.toFixed(2)}`, !guard),
      step("Reasoning trace", input.reasoning, !reasoningBad),
    ],
  };
}

export type VerificationInput = {
  jailbreak: number;
  injection: number;
  extractionSupported: number;
  extractionInvented: number;
  citationSupports: number;
  reasoning: string;
  toolArgsMatch: number;
  toolIgnored: number;
};

export function decideVerification(input: VerificationInput, threshold = 0.55): RouteDecision & { failed: string[] } {
  const failed: string[] = [];
  if (input.jailbreak >= threshold) failed.push("prompt jailbreak");
  if (input.injection >= threshold) failed.push("prompt injection");
  if (input.extractionSupported < 0.45 || input.extractionInvented >= threshold) failed.push("extraction");
  if (input.citationSupports < 0.45) failed.push("citation");
  if (input.reasoning !== "sound") failed.push("reasoning trace");
  if (input.toolArgsMatch < 0.45 || input.toolIgnored >= threshold) failed.push("tool call");
  return {
    failed,
    destination: failed.length ? "fail" : "pass",
    tone: failed.length ? "stop" : "go",
    headline: failed.length ? `Fail · ${failed[0]}` : "Pass",
    summary: failed.length ? `Detectors over the line: ${failed.join(", ")}.` : "No detector crossed the fail line.",
    steps: [
      step("Prompt", `jailbreak ${input.jailbreak.toFixed(2)}, injection ${input.injection.toFixed(2)}`, !failed.includes("prompt jailbreak") && !failed.includes("prompt injection")),
      step("Extraction", `supported ${input.extractionSupported.toFixed(2)}`, !failed.includes("extraction")),
      step("Citation", input.citationSupports.toFixed(2), !failed.includes("citation")),
      step("Reasoning", input.reasoning, !failed.includes("reasoning trace")),
      step("Tool call", `args ${input.toolArgsMatch.toFixed(2)}`, !failed.includes("tool call")),
    ],
  };
}

function headlineFor(destination: string): string {
  return destination
    .split("-")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}
