# Jev Atlas

Live demos of every category and use case on the [TypeSafe use-case map](https://docs.typesafe.ai/concepts/use-case-map). Each page sends a real [System One](https://docs.typesafe.ai/api/system-one) request through the official [`@typesafe-ai/sdk`](https://docs.typesafe.ai/sdk/javascript). You bring the key.

## Setup

Node 22 or newer.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

| Script | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run build` / `npm start` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest for the client, proxy, key storage, and decision logic |
| `npm run record-relay -- --mock` | Labeled mock clip of the Relay wave. A live clip needs `TYPESAFE_API_KEY` |
| `npm run semantic-lint -- <files>` | CLI that calls Jev. Needs `TYPESAFE_API_KEY` |

Deploy on Vercel with no required environment variable. The browser key is not a server secret. Set `TYPESAFE_API_KEY` only if you want the GitHub Action or the CLI to call Jev in CI.

## Bring your own key

1. Create a key at [console.typesafe.ai/keys](https://console.typesafe.ai/keys).
2. Paste it in the header. It is stored in `localStorage` under `jev-atlas.apiKey` and never written to a cookie or a server log.
3. The browser sends `Authorization: Bearer <key>` to this app’s `/api/jev` and `/api/models`.
4. The server builds a `TypeSafeClient` (`logLevel: "off"`) and calls `POST https://api.typesafe.ai/v1/systemone` or `GET https://api.typesafe.ai/v1/models`.

The browser does not call `api.typesafe.ai` directly. An `OPTIONS` preflight from this app’s origin did not return `Access-Control-Allow-Origin`, so the same-origin proxy forwards the documented System One request. It is not an open proxy: the upstream URL is fixed, the body is capped at 1,000,000 characters, and the key is redacted from error text. The landing page does not explain that hop. It states the price.

Every demo measures the round trip and prices input tokens at **$0.042 per million** (`$42/Btok`, also written `$0.042` per Mtok, on [the models page](https://docs.typesafe.ai/models)). Output tokens are free. Docs do not publish a per-call price, so the site does not invent one. A chars/4 figure shown before a call is an estimate. Requests use the alias `jev-latest`. The response `model` field is the resolved version.

The [use-case map](https://docs.typesafe.ai/concepts/use-case-map) documents real-time decisions at 150 ms and describes this class of work as 100x cheaper. The latency drawn on each demo is the measured round trip through this app and the network, set against that 150 ms mark. Relay does not use that figure as its claim. It shows the round trip beside model time, and model time only when a response timing header names `model`, `inference`, or `jev`. Relay turns retries off so each judgment is one attempt.

## Relay

`/relay` loads the latest English Wikipedia edits (up to 2,400) and subscribes to the public Wikimedia recent-changes stream at `https://stream.wikimedia.org/v2/stream/recentchange`. Each line is the page title, the wiki, and the edit summary. With a key in the browser, a judgment is one System One choice: keep, review, or revert, under the policy in the box.

Re-judge sends that policy across the backlog. Once a decision exists, its cell can change color. The sweep runs top to bottom in 1.4 seconds and waits if a result is not in yet. That sweep is playback. Next to it is the wall clock from the click to the last response. Flipped cells are the new color with a light ring. Unchanged cells stay dim. Spend is the sum of reported input tokens at $0.042 per million.

`?mock=1` is a labeled stand-in for review. The edits are still from Wikipedia. The decisions are a local rule, spend stays blank, and the page does not call Jev. `npm run record-relay -- --mock` writes a clip that opens on the sweep, then cuts back to the stream and the policy being typed. Without `--mock`, the recorder exits unless `TYPESAFE_API_KEY` is set. It does not invent a live take.

`/demos/realtime` redirects to `/relay`.

### What the proxy will not forward

Image and `box` questions are part of the documented API (`TypeSafe-Danger-Zone-Images`, model `jev-preview`). This showcase is text-only, and `src/lib/jev/validate.ts` rejects `assets` and `type: "box"` before the SDK sees them. There is no undocumented endpoint hiding behind that check.

Two headers are local to the proxy and are not Jev fields: `x-atlas-timeout-ms` (clamped to 1–30 seconds, default 20) and `x-atlas-max-retries` (clamped to 0–2, default 2). The SDK retries 408, 429, and 5xx.

## How a demo is shaped

Jev returns `choice`, `score`, or `noul` answers. Code owns the branch, the rank, the queue, and the model pick. Threshold sliders recompute that code without a second call.

Structured extraction does not invent a free-text generation endpoint. E-commerce attributes are spans the app already found with a dictionary or a regular expression. Jev chooses among those spans, or `none`.

Feature extraction trains a logistic regression in the browser. A forward search keeps a proposed noul only when it improves held-out log loss. The candidate bank lives in the repo. The cookbook’s proposal step can be written by another model; here you edit one instruction and the rest stay in code. Prior purchases are a structured column, and the chart compares the fitted model with a structured-only model, a keyword rule, and a majority baseline.

Demand forecasting keeps a seasonal exponential smooth on the weekly series and multiplies the next four weeks by a semantic factor clamped between 0.7 and 1.35.

The knowledge graph lays nodes out with a force simulation, walks edges by probability, then issues a second request whose options are the children of the domain chosen on the first call.

Map-reduce generates 2,000 traces with planted labels. Batch sizes are 12, 40, 100, 400, and 2,000. A full run is a real bill, estimated before you start. The table shows the last eight rows, not all two thousand.

## Semantic lint in CI

The same checks as `/demos/semantic-lint` run from the command line:

```bash
TYPESAFE_API_KEY=... npm run semantic-lint -- examples/lint-target.ts
TYPESAFE_API_KEY=... npm run semantic-lint -- --json --threshold 0.6 examples/clean-module.ts
```

Exit 0 means clean, 1 means a finding at or above the threshold, 2 means the command could not run.

[`.github/actions/jev-semantic-lint`](.github/actions/jev-semantic-lint/action.yml) is a composite action. [`.github/workflows/semantic-lint.yml`](.github/workflows/semantic-lint.yml) runs it on pull requests when the `TYPESAFE_API_KEY` repository secret is set, and skips otherwise. It lints `examples/clean-module.ts` and `examples/release-note.md`. `examples/lint-target.ts` is the dirty sample for the UI and a local run.

## Demos

Gallery filters: industry, decision shape, and category versus use case. Each card links to `/demos/<slug>`.

### Categories

| Demo | Path | Decision shapes |
| --- | --- | --- |
| Code owns the branch | `/demos/automation` | Classification, Detection, Scoring, Routing |
| Relay | `/relay` | Detection, Scoring, Routing |
| Trace foundry | `/demos/map-reduce` | Classification, Detection, Search |
| Check the other model | `/demos/universal-verification` | Verification, Detection, Classification |
| Harness bench | `/demos/harness` | Routing, Retrieval, Scoring, Verification, Classification, Detection |

### Use cases

Bullets match the use-case map.

**Search and retrieval** — `/demos/search` — Search, Retrieval, Scoring, Ranking

- Replace or supplement embeddings in RAG pipelines with semantic search, scoring, and ranking.
- Score query-to-candidate relevance.
- Rerank results with pairwise comparisons.
- Cross-encode queries and candidates for higher precision.
- Select useful context for downstream AI workflows.

**Scientific discovery** — `/demos/science` — Classification, Detection, Verification, Structured Data Extraction

- Screen papers against inclusion and exclusion criteria for systematic reviews.
- Label passages in interview transcripts, open-ended survey responses, and field notes using predefined themes or categories.
- Check whether cited passages support claims in manuscripts and generated summaries.
- Flag missing methodological details, such as controls, dataset descriptions, and experimental settings.
- Identify entities and relationships across papers to build research knowledge graphs, linking findings to supporting passages.

**Model routing** — `/demos/model-routing` — Classification, Scoring, Detection, Routing

- Use Jev to build a custom router that chooses which LLM receives each prompt.
- Set routing rules and thresholds for your specific workflow.
- Classify intent and domain.
- Estimate difficulty and risk.
- Escalate requests that need a more expensive model.

**LLM guardrails** — `/demos/guardrails` — Detection, Scoring, Verification, Routing

- Place semantic checks on every LLM input, output, and tool call at a fraction of the cost of the LLM call.
- Detect jailbreaks and prompt injection.
- Identify policy violations and sensitive-data exposure.
- Detect tool-call errors and response-quality failures in real time.
- Log structured check results and probabilities to make AI system and harness failures easier to trace.

**Semantic code linting** — `/demos/semantic-lint` — Detection, Classification, Verification

- Use Jev queries to add automated semantic lints to code and writing.
- Define checks for your team's coding conventions and writing guidelines.
- Run these checks in CI and flag violations for review.

**Feature extraction for predictive modeling** — `/demos/feature-extraction` — ML Feature Extraction, Detection, Scoring

- Use Jev to extract probabilistic features from natural-language data.
- Combine these features with structured data to train models for tasks with ground-truth outcomes.
- Use autoresearch workflows to propose feature definitions and evaluate their predictive value against held-out ground truth.

**Recruiting** — `/demos/recruiting` — Detection, Scoring, Classification, Routing

- Evaluate resumes, applications, and interview feedback against explicit, job-related criteria.
- Identify relevant experience.
- Score evidence for required competencies.
- Match candidates to roles.
- Route candidates to hiring managers or recruiters.
- Escalate uncertain cases for human review.

**Lead generation** — `/demos/lead-generation` — Scoring, Detection, Ranking, Routing

- Match company profiles, executive biographies, and inbound messages to an ideal customer profile.
- Score industry fit and company maturity.
- Detect buyer relevance, pain points, and purchase intent.
- Prioritize and route leads.

**Customer support** — `/demos/customer-support` — Classification, Structured Data Extraction, Detection, Scoring, Routing, Verification

- Classify incoming tickets by issue, product area, and customer intent.
- Process call transcripts to extract customer issues, commitments, and follow-up actions.
- Detect urgency, frustration, churn risk, and refund requests.
- Route cases to the right team, queue, or automated workflow.
- Verify support responses against policies and the customer's request.

**Insurance claims** — `/demos/insurance-claims` — Classification, Detection, Scoring, Routing

- Classify first-notice-of-loss reports, adjuster notes, and supporting documents.
- Detect claim complexity, missing information, and potential fraud indicators.
- Prioritize claims for straight-through processing or specialist review.
- Escalate uncertain or high-risk cases to a human adjuster.

**Financial crime** — `/demos/financial-crime` — Detection, Verification, Scoring, Routing

- Evaluate transaction narratives, KYC documents, and alert histories for suspicious characteristics.
- Match entities across inconsistent names, profiles, and records.
- Prioritize alerts by risk, relevance, and evidence quality.
- Route ambiguous cases to investigators for review.

**Legal and compliance** — `/demos/legal-compliance` — Classification, Detection, Verification, Routing

- Classify contracts, policies, regulatory filings, and marketing claims.
- Detect missing clauses, prohibited claims, and policy violations.
- Verify documents against explicit legal or compliance requirements.
- Escalate high-risk or uncertain findings to counsel or compliance teams.

**E-commerce marketplaces** — `/demos/ecommerce` — Classification, Structured Data Extraction, Detection, Scoring, Ranking, Routing

- Classify and normalize product listings across inconsistent seller catalogs.
- Extract product attributes from titles and descriptions.
- Detect prohibited listings, counterfeit signals, review abuse, and policy violations.
- Rank products and route uncertain listings for human review.

**Moderation and trust and safety** — `/demos/moderation` — Detection, Scoring, Routing

- Apply company-specific, nuanced criteria to decide which posts meet your moderation standards.
- Moderate user content and automated conversations across communities, customer support, and SDR workflows.
- Detect toxicity, harassment, spam, fraud, unsafe advice, personal-data exposure, opt-out requests, and policy-violating claims.
- Combine severity and confidence to allow, warn, review, or block content.

**Advertising** — `/demos/advertising` — Classification, Scoring, Detection, Verification

- Evaluate creative assets, campaign copy, landing pages, and placement context.
- Classify brand safety and audience suitability.
- Check regulatory compliance and prohibited claims.
- Evaluate creative quality and ad-to-landing-page alignment.

**Gaming** — `/demos/gaming` — Classification, Detection, Scoring, Routing

- Evaluate player reports, in-game chat, reviews, and support conversations.
- Moderate chat and detect abuse, toxicity, or suspicious behavior.
- Annotate content and score frustration or engagement.
- Detect churn signals and route player-support requests.

**Risk assessment** — `/demos/risk-assessment` — Classification, Detection, Scoring, Routing, ML Feature Extraction

- Convert incident reports, claims notes, transaction descriptions, and vendor assessments into probabilistic risk indicators.
- Use these indicators in insurance and underwriting workflows.
- Classify risk types and detect suspicious characteristics.
- Score severity and prioritize review.
- Extract features for broader risk models.

**Demand forecasting** — `/demos/demand-forecasting` — ML Feature Extraction, Detection, Scoring, Classification

- Enrich forecasting models with semantic signals from customer inquiries, sales notes, product reviews, support tickets, and market reports.
- Extract purchase intent, urgency, and product interest.
- Detect supply concerns, competitive pressure, and emerging demand themes.
- Feed those features into a forecasting model alongside historical time-series data.

**Graphs and knowledge graphs** — `/demos/knowledge-graph` — Classification, Detection, Verification, Search

- Annotate and verify knowledge graphs with typed semantic decisions.
- Classify relationships and entity types.
- Detect contradictions between records or claims.
- Support probabilistic traversal and hierarchical classification.

## Tests

`npm test` mocks `fetch` and never calls the live API. Runtime still uses the real System One path. There is no mock-results mode in the UI. Without a key, Run opens the key dialog and the page explains that the key is missing.
