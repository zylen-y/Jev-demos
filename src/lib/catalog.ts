export const DECISION_SHAPES = [
  { id: "Classification", reach: "One known category should win", examples: "Intent, topic, department, risk type, entity type" },
  { id: "Detection", reach: "You need a probability that one property is present", examples: "Spam, fraud, urgency, jailbreaks, sensitive data" },
  { id: "Scoring", reach: "The answer belongs on an ordered rubric", examples: "Severity, relevance, quality, frustration, suitability" },
  { id: "Routing", reach: "A category selects the next code path", examples: "Tool use, escalation, model routing, support queues" },
  { id: "Search", reach: "You need to find items that match a natural-language query", examples: "Semantic search, document discovery, candidate generation" },
  { id: "Retrieval", reach: "A workflow needs the most relevant context or records", examples: "RAG context, evidence retrieval, knowledge lookup" },
  { id: "Ranking", reach: "Items need to be ordered by semantic relevance or quality", examples: "Search results, recommendations, candidate prioritization" },
  { id: "Verification", reach: "An artifact must be checked for specific failure modes", examples: "Citation support, policy violations, tool-call errors, response quality" },
  { id: "ML Feature Extraction", reach: "A downstream classical ML model needs semantic signals", examples: "Purchase intent, product interest, competitive pressure, churn signals" },
  { id: "Structured Data Extraction", reach: "Known fields must be recovered from unstructured input", examples: "Candidate attributes, order fields, document labels" },
] as const;

export type DecisionShape = (typeof DECISION_SHAPES)[number]["id"];

export type DemoKind = "category" | "use-case";

export type DemoMeta = {
  slug: string;
  kind: DemoKind;
  title: string;
  eyebrow: string;
  summary: string;
  industry: string;
  shapes: DecisionShape[];
  bullets: string[];
};

export const CATEGORY_COPY = [
  {
    id: "automation",
    title: "AI automation software",
    body: "Interleave AI with reliable software in a way where you can run it a million times in the background without a human co-pilot. Code owns control flow while TypeSafe handles the semantic decisions and language understanding.",
  },
  {
    id: "realtime",
    title: "Real-time applications",
    body: "Frontier intelligence at real-time speeds (150ms) means AI can make decisions faster than human perception. Fast and smart enough to be programmed to play games or embedded into a UI.",
  },
  {
    id: "map-reduce",
    title: "AI map-reduce over big data",
    body: "100x cheaper means you can process giant datasets. Search for relevant information over giant corpuses, classify giant agent traces, and extract features to make predictions.",
  },
  {
    id: "verification",
    title: "Universal verification",
    body: "Verify the input prompt, extractions, reasoning traces, tool calls, or inputs of any other AI. Detect jailbreaks, citation errors, hallucinations, mistakes, or other error-modes that other AIs or LLMs make at a fraction of the cost for the actual LLM call.",
  },
  {
    id: "harness",
    title: "Harness engineering",
    body: "Use Jev queries to make your harness smarter — model routing, semantic context retrieval, LLM error detection and guardrails, reasoning trace classification at lightspeed and a fraction of the cost.",
  },
] as const;

export const DEMOS: DemoMeta[] = [
  {
    slug: "automation",
    kind: "category",
    title: "Code owns the branch",
    eyebrow: "AI automation software",
    summary: "A ticket runs through a workflow whose branches are if-statements. Jev only answers the narrow questions those branches need.",
    industry: "Software",
    shapes: ["Classification", "Detection", "Scoring", "Routing"],
    bullets: [
      "Code owns control flow while Jev answers the semantic questions.",
      "The same probabilities can be re-thresholded without another model call.",
      "Uncertain or unsafe inputs escalate instead of being guessed.",
    ],
  },
  {
    slug: "realtime",
    kind: "category",
    title: "Relay",
    eyebrow: "Real-time applications",
    summary: "A live switchboard. Jev routes each message as it arrives, and you can race it. Latency sits next to a 150ms reference.",
    industry: "Software",
    shapes: ["Detection", "Scoring", "Routing"],
    bullets: [
      "One fan-out request per message, fast enough to drive a UI.",
      "The round trip is measured and drawn against the 150ms model target.",
      "Allow, warn, review, and block come from severity and confidence in code.",
    ],
  },
  {
    slug: "map-reduce",
    kind: "category",
    title: "Trace foundry",
    eyebrow: "AI map-reduce over big data",
    summary: "Classify a generated corpus of 2,000 agent traces. Progress, throughput, cost, and agreement with the planted labels update as the batch runs.",
    industry: "Data",
    shapes: ["Classification", "Detection", "Search"],
    bullets: [
      "Map a semantic decision across thousands of records.",
      "Optional natural-language search over the same corpus.",
      "Throughput and a token-priced cost estimate before you spend.",
    ],
  },
  {
    slug: "universal-verification",
    kind: "category",
    title: "Check the other model",
    eyebrow: "Universal verification",
    summary: "One packet contains a prompt, an extraction, a citation, a reasoning trace, and a tool call. Each failure mode is its own detector.",
    industry: "Software",
    shapes: ["Verification", "Detection", "Classification"],
    bullets: [
      "Verify the input prompt for jailbreaks and prompt injection.",
      "Check extractions and citations against the source.",
      "Classify reasoning-trace errors and tool-call mistakes.",
    ],
  },
  {
    slug: "harness",
    kind: "category",
    title: "Harness bench",
    eyebrow: "Harness engineering",
    summary: "Route the prompt, keep the passages that clear a relevance bar, then hold the draft if the tool call or the reasoning trace fails.",
    industry: "Software",
    shapes: ["Routing", "Retrieval", "Scoring", "Verification", "Classification", "Detection"],
    bullets: [
      "Choose which model receives the prompt.",
      "Retrieve context by scoring passages, not by a separate embedding index.",
      "Detect guardrail failures and classify the reasoning trace.",
    ],
  },
  {
    slug: "search",
    kind: "use-case",
    title: "Search and retrieval",
    eyebrow: "Handbook",
    summary: "Score every passage against a query, keep the ones worth sending on, then rerank the top of the list with pairwise comparisons.",
    industry: "Software",
    shapes: ["Search", "Retrieval", "Scoring", "Ranking"],
    bullets: [
      "Replace or supplement embeddings in RAG pipelines with semantic search, scoring, and ranking.",
      "Score query-to-candidate relevance.",
      "Rerank results with pairwise comparisons.",
      "Cross-encode queries and candidates for higher precision.",
      "Select useful context for downstream AI workflows.",
    ],
  },
  {
    slug: "science",
    kind: "use-case",
    title: "Scientific discovery",
    eyebrow: "Systematic review",
    summary: "Screen an abstract, label an interview, check a citation, flag missing methods, and link a finding to the passage that supports it.",
    industry: "Scientific research",
    shapes: ["Classification", "Detection", "Verification", "Structured Data Extraction"],
    bullets: [
      "Screen papers against inclusion and exclusion criteria for systematic reviews.",
      "Label passages in interview transcripts, open-ended survey responses, and field notes using predefined themes or categories.",
      "Check whether cited passages support claims in manuscripts and generated summaries.",
      "Flag missing methodological details, such as controls, dataset descriptions, and experimental settings.",
      "Identify entities and relationships across papers to build research knowledge graphs, linking findings to supporting passages.",
    ],
  },
  {
    slug: "model-routing",
    kind: "use-case",
    title: "Model routing",
    eyebrow: "Inference",
    summary: "Intent, domain, difficulty, and risk become a model pick. The thresholds are sliders, which means they are code.",
    industry: "Software",
    shapes: ["Classification", "Scoring", "Detection", "Routing"],
    bullets: [
      "Use Jev to build a custom router that chooses which LLM receives each prompt.",
      "Set routing rules and thresholds for your specific workflow.",
      "Classify intent and domain.",
      "Estimate difficulty and risk.",
      "Escalate requests that need a more expensive model.",
    ],
  },
  {
    slug: "guardrails",
    kind: "use-case",
    title: "LLM guardrails",
    eyebrow: "Safety",
    summary: "Input, output, and tool call are checked in one request. The log is the probabilities, not a paragraph of advice.",
    industry: "Trust & safety",
    shapes: ["Detection", "Scoring", "Verification", "Routing"],
    bullets: [
      "Place semantic checks on every LLM input, output, and tool call at a fraction of the cost of the LLM call.",
      "Detect jailbreaks and prompt injection.",
      "Identify policy violations and sensitive-data exposure.",
      "Detect tool-call errors and response-quality failures in real time.",
      "Log structured check results and probabilities to make AI system and harness failures easier to trace.",
    ],
  },
  {
    slug: "semantic-lint",
    kind: "use-case",
    title: "Semantic code linting",
    eyebrow: "CI",
    summary: "Conventions for code and writing, judged per file. The same checks run in the browser, the CLI, and a GitHub Action.",
    industry: "Software",
    shapes: ["Detection", "Classification", "Verification"],
    bullets: [
      "Use Jev queries to add automated semantic lints to code and writing.",
      "Define checks for your team's coding conventions and writing guidelines.",
      "Run these checks in CI and flag violations for review.",
    ],
  },
  {
    slug: "feature-extraction",
    kind: "use-case",
    title: "Feature extraction",
    eyebrow: "Predictive modeling",
    summary: "Jev turns reviews into probabilities. A logistic regression trains on those features plus a structured column, and a forward search keeps only what helps on holdout.",
    industry: "Data",
    shapes: ["ML Feature Extraction", "Detection", "Scoring"],
    bullets: [
      "Use Jev to extract probabilistic features from natural-language data.",
      "Combine these features with structured data to train models for tasks with ground-truth outcomes.",
      "Use autoresearch workflows to propose feature definitions and evaluate their predictive value against held-out ground truth.",
    ],
  },
  {
    slug: "recruiting",
    kind: "use-case",
    title: "Recruiting",
    eyebrow: "Hiring",
    summary: "Experience, competency evidence, and role fit. Uncertain matches go to a person even when the score looks high.",
    industry: "Recruiting",
    shapes: ["Detection", "Scoring", "Classification", "Routing"],
    bullets: [
      "Evaluate resumes, applications, and interview feedback against explicit, job-related criteria.",
      "Identify relevant experience.",
      "Score evidence for required competencies.",
      "Match candidates to roles.",
      "Route candidates to hiring managers or recruiters.",
      "Escalate uncertain cases for human review.",
    ],
  },
  {
    slug: "lead-generation",
    kind: "use-case",
    title: "Lead generation",
    eyebrow: "Sales",
    summary: "Three companies, one ideal customer profile, one request. Code sorts them and picks a route for each.",
    industry: "Sales",
    shapes: ["Scoring", "Detection", "Ranking", "Routing"],
    bullets: [
      "Match company profiles, executive biographies, and inbound messages to an ideal customer profile.",
      "Score industry fit and company maturity.",
      "Detect buyer relevance, pain points, and purchase intent.",
      "Prioritize and route leads.",
    ],
  },
  {
    slug: "customer-support",
    kind: "use-case",
    title: "Customer support",
    eyebrow: "Service",
    summary: "Classify the ticket, read the transcript for commitments, detect churn and refunds, route the queue, and check the draft against policy.",
    industry: "Customer support",
    shapes: ["Classification", "Structured Data Extraction", "Detection", "Scoring", "Routing", "Verification"],
    bullets: [
      "Classify incoming tickets by issue, product area, and customer intent.",
      "Process call transcripts to extract customer issues, commitments, and follow-up actions.",
      "Detect urgency, frustration, churn risk, and refund requests.",
      "Route cases to the right team, queue, or automated workflow.",
      "Verify support responses against policies and the customer's request.",
    ],
  },
  {
    slug: "insurance-claims",
    kind: "use-case",
    title: "Insurance claims",
    eyebrow: "Claims",
    summary: "Peril, complexity, missing documents, and fraud indicators decide straight-through processing or a specialist.",
    industry: "Insurance",
    shapes: ["Classification", "Detection", "Scoring", "Routing"],
    bullets: [
      "Classify first-notice-of-loss reports, adjuster notes, and supporting documents.",
      "Detect claim complexity, missing information, and potential fraud indicators.",
      "Prioritize claims for straight-through processing or specialist review.",
      "Escalate uncertain or high-risk cases to a human adjuster.",
    ],
  },
  {
    slug: "financial-crime",
    kind: "use-case",
    title: "Financial crime",
    eyebrow: "Financial crime",
    summary: "A narrative, a KYC file, and two spellings of a name. Ambiguous entity matches go to an investigator.",
    industry: "Financial services",
    shapes: ["Detection", "Verification", "Scoring", "Routing"],
    bullets: [
      "Evaluate transaction narratives, KYC documents, and alert histories for suspicious characteristics.",
      "Match entities across inconsistent names, profiles, and records.",
      "Prioritize alerts by risk, relevance, and evidence quality.",
      "Route ambiguous cases to investigators for review.",
    ],
  },
  {
    slug: "legal-compliance",
    kind: "use-case",
    title: "Legal and compliance",
    eyebrow: "Counsel",
    summary: "Document type, missing clauses, prohibited claims, and two explicit requirements. High-risk findings escalate.",
    industry: "Legal & compliance",
    shapes: ["Classification", "Detection", "Verification", "Routing"],
    bullets: [
      "Classify contracts, policies, regulatory filings, and marketing claims.",
      "Detect missing clauses, prohibited claims, and policy violations.",
      "Verify documents against explicit legal or compliance requirements.",
      "Escalate high-risk or uncertain findings to counsel or compliance teams.",
    ],
  },
  {
    slug: "ecommerce",
    kind: "use-case",
    title: "E-commerce marketplaces",
    eyebrow: "Marketplace",
    summary: "Normalize a messy listing, pick attributes from spans the code already found, and hold anything counterfeit or uncertain.",
    industry: "E-commerce",
    shapes: ["Classification", "Structured Data Extraction", "Detection", "Scoring", "Ranking", "Routing"],
    bullets: [
      "Classify and normalize product listings across inconsistent seller catalogs.",
      "Extract product attributes from titles and descriptions.",
      "Detect prohibited listings, counterfeit signals, review abuse, and policy violations.",
      "Rank products and route uncertain listings for human review.",
    ],
  },
  {
    slug: "moderation",
    kind: "use-case",
    title: "Moderation and trust & safety",
    eyebrow: "Trust & safety",
    summary: "Company-specific criteria, then a matrix of severity and confidence that allows, warns, reviews, or blocks.",
    industry: "Trust & safety",
    shapes: ["Detection", "Scoring", "Routing"],
    bullets: [
      "Apply company-specific, nuanced criteria to decide which posts meet your moderation standards.",
      "Moderate user content and automated conversations across communities, customer support, and SDR workflows.",
      "Detect toxicity, harassment, spam, fraud, unsafe advice, personal-data exposure, opt-out requests, and policy-violating claims.",
      "Combine severity and confidence to allow, warn, review, or block content.",
    ],
  },
  {
    slug: "advertising",
    kind: "use-case",
    title: "Advertising",
    eyebrow: "Brand safety",
    summary: "Creative, landing page, and placement. Brand safety, suitability, regulated claims, quality, and whether the ad matches the page.",
    industry: "Advertising",
    shapes: ["Classification", "Scoring", "Detection", "Verification"],
    bullets: [
      "Evaluate creative assets, campaign copy, landing pages, and placement context.",
      "Classify brand safety and audience suitability.",
      "Check regulatory compliance and prohibited claims.",
      "Evaluate creative quality and ad-to-landing-page alignment.",
    ],
  },
  {
    slug: "gaming",
    kind: "use-case",
    title: "Gaming",
    eyebrow: "Player experience",
    summary: "A report, a chat log, a review, and a support note. Abuse, frustration, engagement, and churn pick the queue.",
    industry: "Gaming",
    shapes: ["Classification", "Detection", "Scoring", "Routing"],
    bullets: [
      "Evaluate player reports, in-game chat, reviews, and support conversations.",
      "Moderate chat and detect abuse, toxicity, or suspicious behavior.",
      "Annotate content and score frustration or engagement.",
      "Detect churn signals and route player-support requests.",
    ],
  },
  {
    slug: "risk-assessment",
    kind: "use-case",
    title: "Risk assessment",
    eyebrow: "Underwriting",
    summary: "An incident note becomes a risk type, a severity, and a feature vector another model can consume.",
    industry: "Insurance",
    shapes: ["Classification", "Detection", "Scoring", "Routing", "ML Feature Extraction"],
    bullets: [
      "Convert incident reports, claims notes, transaction descriptions, and vendor assessments into probabilistic risk indicators.",
      "Use these indicators in insurance and underwriting workflows.",
      "Classify risk types and detect suspicious characteristics.",
      "Score severity and prioritize review.",
      "Extract features for broader risk models.",
    ],
  },
  {
    slug: "demand-forecasting",
    kind: "use-case",
    title: "Demand forecasting",
    eyebrow: "Planning",
    summary: "A weekly series stays a weekly series. Semantic signals from notes and reviews nudge the next four weeks.",
    industry: "Retail & operations",
    shapes: ["ML Feature Extraction", "Detection", "Scoring", "Classification"],
    bullets: [
      "Enrich forecasting models with semantic signals from customer inquiries, sales notes, product reviews, support tickets, and market reports.",
      "Extract purchase intent, urgency, and product interest.",
      "Detect supply concerns, competitive pressure, and emerging demand themes.",
      "Feed those features into a forecasting model alongside historical time-series data.",
    ],
  },
  {
    slug: "knowledge-graph",
    kind: "use-case",
    title: "Graphs and knowledge graphs",
    eyebrow: "Knowledge",
    summary: "Type the entities, classify the edges, flag a contradiction, walk the most probable path, then classify one level deeper.",
    industry: "Scientific research",
    shapes: ["Classification", "Detection", "Verification", "Search"],
    bullets: [
      "Annotate and verify knowledge graphs with typed semantic decisions.",
      "Classify relationships and entity types.",
      "Detect contradictions between records or claims.",
      "Support probabilistic traversal and hierarchical classification.",
    ],
  },
];

export function getDemo(slug: string): DemoMeta | undefined {
  return DEMOS.find((demo) => demo.slug === slug);
}

export function demosByShape(shape: string): DemoMeta[] {
  return DEMOS.filter((demo) => demo.shapes.includes(shape as DecisionShape));
}

export function demosByIndustry(industry: string): DemoMeta[] {
  return DEMOS.filter((demo) => demo.industry === industry);
}

export function industries(): string[] {
  return [...new Set(DEMOS.map((demo) => demo.industry))];
}
