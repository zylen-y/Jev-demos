import { BRAND_DICTIONARY, COLOR_DICTIONARY, SIZE_PATTERN, dictionaryHits, patternHits, withNone } from "../candidates";
import {
  decideAd,
  decideClaim,
  decideCrime,
  decideLegal,
  decideListing,
  decideModeration,
  decidePlayer,
  decideRecruiting,
  decideRisk,
  decideSupport,
  moderationThresholds,
  recruitingThresholds,
  routeLead,
  scoreLead,
  claimThresholds,
} from "../decisions";
import { readChoice, readNoul, readScore, scoreUnit } from "../jev/parse";
import { choice, noul, request, score } from "../jev/questions";
import { cItem, fItem, mItem, nItem, sItem } from "./present";
import type { CaseDemoConfig } from "./types";

const rubric3 = ["Thin or absent", "Some evidence", "Repeated, specific evidence"] as const;

export const recruitingDemo: CaseDemoConfig = {
  slug: "recruiting",
  stateNote: "Criteria stay in the state so the questions point at them instead of hiding them in a prompt.",
  fields: [
    { key: "role", label: "Role", rows: 3 },
    { key: "requirements", label: "Job-related criteria", rows: 4 },
    { key: "resume", label: "Resume", rows: 7 },
    { key: "interview", label: "Interview notes", rows: 4 },
  ],
  thresholds: [
    { key: "manager", label: "Composite score that routes to the hiring manager", min: 0.4, max: 0.9, step: 0.01, default: recruitingThresholds.manager },
    { key: "recruiter", label: "Composite score that routes to a recruiter", min: 0.2, max: 0.8, step: 0.01, default: recruitingThresholds.recruiter },
    { key: "confidence", label: "Match confidence below which a person reviews", min: 0.2, max: 0.9, step: 0.01, default: recruitingThresholds.confidence },
  ],
  samples: [
    {
      id: "strong",
      title: "On-call lead",
      blurb: "The resume names production incidents and the interview confirms them.",
      fields: {
        role: "Senior infrastructure engineer. Owns on-call for a multi-region API.",
        requirements:
          "Has operated a distributed system in production. Has led an incident. Has mentored other engineers. Communication is specific rather than ornamental.",
        resume:
          "Ife Okonkwo. 2019–2026, Northline. On-call lead for the orders API across three regions. Led the 2024 failover incident, wrote the timeline, and changed the health check that had flapped. Mentored two new grads through their first pages. Previously built the queue that replaced a single Postgres table.",
        interview:
          "Panel: she described the failover without blaming the intern who shipped the bad check. She could name the dashboard and the customer impact (checkout down 18 minutes).",
      },
    },
    {
      id: "thin",
      title: "Adjacent resume",
      blurb: "Helpful support background, little production systems evidence.",
      fields: {
        role: "Senior infrastructure engineer. Owns on-call for a multi-region API.",
        requirements: "Has operated a distributed system in production. Has led an incident. Has mentored other engineers.",
        resume:
          "Sam Patel. Customer support lead, 2021–2026. Wrote help-center articles and escalated bugs to engineering. Took a weekend Kubernetes tutorial. Enjoys mentoring new support hires.",
        interview: "Enthusiastic. Could not describe a production incident. Said they would 'figure out the dashboards'.",
      },
    },
  ],
  request: (fields) =>
    request(fields, {
      exp_distributed: noul("Does `resume` or `interview` show that the candidate has operated a distributed system in production, as `requirements` asks?", {
        true: "There is specific production systems experience.",
        false: "That experience is missing or only hypothetical.",
      }),
      exp_incident: noul("Does `resume` or `interview` show the candidate has led an incident?", {
        true: "A real incident is described.",
        false: "No incident leadership is described.",
      }),
      exp_mentor: noul("Does `resume` or `interview` show mentoring?", {
        true: "Mentoring is described.",
        false: "Mentoring is not described.",
      }),
      comp_systems: score("How strong is the evidence of production systems skill against `requirements`?", [...rubric3]),
      comp_communication: score("How specific and job-related is the communication evidence in `interview`?", [...rubric3]),
      comp_ownership: score("How strong is the evidence that the candidate has owned an outcome, not only assisted?", [...rubric3]),
      role_match: choice("How well does the candidate match `role` given `requirements`?", {
        strong: "The evidence covers the role",
        partial: "Some of the role is covered",
        weak: "The evidence does not cover the role",
      }),
    }),
  decide: (answers, _fields, thresholds) => {
    const match = readChoice(answers, "role_match");
    const decision = decideRecruiting(
      {
        experience: [readNoul(answers, "exp_distributed"), readNoul(answers, "exp_incident"), readNoul(answers, "exp_mentor")],
        competencies: [scoreUnit(readScore(answers, "comp_systems")), scoreUnit(readScore(answers, "comp_communication")), scoreUnit(readScore(answers, "comp_ownership"))],
        match: match.choice,
        matchConfidence: match.confidence,
      },
      { manager: thresholds.manager, recruiter: thresholds.recruiter, confidence: thresholds.confidence },
    );
    return {
      ...decision,
      groups: [
        {
          title: "Relevant experience",
          items: [nItem("Distributed systems", readNoul(answers, "exp_distributed")), nItem("Incident leadership", readNoul(answers, "exp_incident")), nItem("Mentoring", readNoul(answers, "exp_mentor"))],
        },
        {
          title: "Competency evidence",
          items: [sItem("Systems", readScore(answers, "comp_systems")), sItem("Communication", readScore(answers, "comp_communication")), sItem("Ownership", readScore(answers, "comp_ownership"))],
        },
        { title: "Role match", items: [cItem("Match", match), mItem("Composite", decision.matchScore, "Experience, competencies, and the match choice.")] },
      ],
    };
  },
};

export const leadsDemo: CaseDemoConfig = {
  slug: "lead-generation",
  stateNote: "Three leads share one profile so the comparison is a single fan-out.",
  fields: [
    { key: "icp", label: "Ideal customer profile", rows: 4 },
    { key: "lead_a", label: "Lead A", rows: 4 },
    { key: "lead_b", label: "Lead B", rows: 4 },
    { key: "lead_c", label: "Lead C", rows: 4 },
  ],
  samples: [
    {
      id: "trio",
      title: "Three inbound notes",
      blurb: "One buyer in market, one curious analyst, one poor fit.",
      fields: {
        icp: "Series B to pre-IPO software companies, 200–2000 employees, with a support or trust team that already uses an LLM in production. Buyer is a head of support, platform, or trust. Pain is cost or latency of LLM judgments. Intent to evaluate this quarter.",
        lead_a:
          "Harbor Health. 40-person clinic group. Office manager Dana wrote: 'We need a cheaper phone system. Not looking at AI.' Founded 2014, steady, not a software company.",
        lead_b:
          "Lumen Ledger. Series C fintech, about 600 people. Priya Shah, head of support, wrote: 'Our refund agent calls a big model for every ticket and the bill is absurd. Can we talk this month? We already classify intents, badly.'",
        lead_c:
          "Paper Kite. Seed developer-tools startup, 18 people. CTO bio: ex-research lab, no support org. Inbound: 'Cool demo, maybe next year after we hire.'",
      },
    },
  ],
  request: (fields) => {
    const questions: ReturnType<typeof request>["questions"] = {};
    for (const id of ["a", "b", "c"] as const) {
      const path = `lead_${id}`;
      questions[`industry_${id}`] = score(`How well does \`${path}\` match the industry and company type in \`icp\`?`, [
        "Different industry or far too small or large",
        "Adjacent, or the size is unclear",
        "Matches the industry and the size band",
      ]);
      questions[`maturity_${id}`] = score(`How well does the company maturity in \`${path}\` match \`icp\`?`, [
        "Too early or a poor stage fit",
        "Plausible but unclear",
        "The stage matches the profile",
      ]);
      questions[`relevance_${id}`] = noul(`Is the person in \`${path}\` a relevant buyer for \`icp\`?`, {
        true: "The sender is the kind of buyer the profile names.",
        false: "The sender is not that buyer.",
      });
      questions[`pain_${id}`] = noul(`Does \`${path}\` describe a pain the profile is built for?`, {
        true: "The note names that pain.",
        false: "The pain is absent or different.",
      });
      questions[`intent_${id}`] = noul(`Does \`${path}\` show purchase intent on the timeline in \`icp\`?`, {
        true: "They want to evaluate soon.",
        false: "Intent is absent or distant.",
      });
    }
    return request(fields, questions);
  },
  decide: (answers, fields) => {
    const leads = (["a", "b", "c"] as const).map((id) => {
      const name = fields[`lead_${id}`].split(".")[0] || `Lead ${id.toUpperCase()}`;
      const lead = {
        id,
        name,
        industry: scoreUnit(readScore(answers, `industry_${id}`)),
        maturity: scoreUnit(readScore(answers, `maturity_${id}`)),
        relevance: readNoul(answers, `relevance_${id}`),
        pain: readNoul(answers, `pain_${id}`),
        intent: readNoul(answers, `intent_${id}`),
      };
      const scoreValue = scoreLead(lead);
      const routed = routeLead(scoreValue, lead.intent);
      return { lead, scoreValue, routed };
    });
    const ranked = [...leads].sort((a, b) => b.scoreValue - a.scoreValue);
    const top = ranked[0];
    return {
      headline: `${top.lead.name} · ${top.routed.destination.replaceAll("-", " ")}`,
      tone: top.routed.tone,
      summary: "Fit, pain, and intent stay separate. The sort is in code.",
      steps: ranked.map((item) => ({
        label: item.lead.name,
        detail: `${item.routed.destination} · ${(item.scoreValue * 100).toFixed(0)}`,
        status: item.lead.id === top.lead.id ? "taken" : "skipped",
      })),
      ranked: ranked.map((item) => ({
        id: item.lead.id,
        title: item.lead.name,
        score: item.scoreValue,
        detail: item.routed.destination.replaceAll("-", " "),
      })),
      groups: leads.map((item) => ({
        title: item.lead.name,
        items: [
          sItem("Industry fit", readScore(answers, `industry_${item.lead.id}`)),
          sItem("Company maturity", readScore(answers, `maturity_${item.lead.id}`)),
          nItem("Buyer relevance", item.lead.relevance),
          nItem("Pain", item.lead.pain),
          nItem("Purchase intent", item.lead.intent),
        ],
      })),
    };
  },
};

export const supportDemo: CaseDemoConfig = {
  slug: "customer-support",
  stateNote: "Ticket, transcript, policy, and the draft the agent wants to send.",
  fields: [
    { key: "ticket", label: "Ticket", rows: 3 },
    { key: "transcript", label: "Call transcript", rows: 5 },
    { key: "policy", label: "Policy", rows: 3 },
    { key: "draft", label: "Draft reply", rows: 3 },
  ],
  samples: [
    {
      id: "hold",
      title: "Draft offers a refund the policy refuses",
      blurb: "The customer is churning. The draft promises cash the policy does not.",
      fields: {
        ticket: "Subject: canceling. Product: billing. We have been overcharged since March and I am moving to another vendor.",
        transcript:
          "Customer: I want a refund for the last three months and then cancel. Agent: I can ask finance. Customer: If this is not fixed today I am leaving. Agent: I'll call you tomorrow with an answer.",
        policy: "Duplicate charges are refundable. Subscription fees already used are not refunded. Cancellation is end-of-period.",
        draft: "I've refunded the last three months to your card and canceled the account immediately.",
      },
    },
    {
      id: "outage",
      title: "Checkout outage",
      blurb: "Technical, urgent, and the draft matches the transcript.",
      fields: {
        ticket: "POST /v1/orders returns 500. Product: API. We cannot take payments.",
        transcript: "Customer: checkout has been down for 25 minutes. Agent: I am paging the on-call API owner and will email you when it recovers. No refund was discussed.",
        policy: "Outages are status updates, not refunds, unless a charge captured without an order.",
        draft: "I paged the on-call API owner. I will email you when checkout recovers. I have not issued a refund.",
      },
    },
  ],
  request: (fields) =>
    request(fields, {
      issue: choice("What is the issue in `ticket` and `transcript`?", {
        billing: "Charges, invoices, or plan price",
        outage: "Something is broken",
        how_to: "A question about how to do something",
        abuse: "Fraud, abuse, or a safety concern",
      }),
      product: choice("Which product area is this about?", {
        api: "API or integration",
        dashboard: "The web app",
        billing: "Billing and subscriptions",
        mobile: "The mobile app",
      }),
      intent: choice("What does the customer want?", {
        refund: "Money returned",
        fix: "A bug or outage fixed",
        explain: "An explanation",
        cancel: "To cancel",
      }),
      issue_stated: noul("Does `transcript` state a concrete customer issue?", { true: "A concrete issue is stated.", false: "The issue is missing." }),
      commitment: noul("Does the agent in `transcript` make a commitment?", { true: "The agent promises a follow-up or an action.", false: "No commitment is made." }),
      follow_up: choice("What follow-up action does `transcript` commit to?", {
        callback: "A call back",
        email: "An email",
        engineering: "An engineering page or fix",
        none: "No follow-up",
      }),
      urgency: noul("Is the case urgent?", { true: "It needs action now or today.", false: "It can wait." }),
      frustration: score("How frustrated is the customer?", ["Calm", "Frustrated but civil", "Angry or threatening to leave"]),
      churn: noul("Is there a churn risk?", { true: "The customer may leave.", false: "Churn is not indicated." }),
      refund: noul("Does the customer request a refund?", { true: "A refund is requested.", false: "No refund is requested." }),
      draft_policy: noul("Does `draft` comply with `policy`?", { true: "The draft stays inside the policy.", false: "The draft breaks the policy." }),
      draft_answers: noul("Does `draft` address the customer's request in `transcript`?", { true: "The draft answers the request.", false: "The draft misses it." }),
    }),
  decide: (answers) => {
    const issue = readChoice(answers, "issue");
    const product = readChoice(answers, "product");
    const intent = readChoice(answers, "intent");
    const follow = readChoice(answers, "follow_up");
    const decision = decideSupport({
      issue: issue.choice,
      product: product.choice,
      intent: intent.choice,
      urgency: readNoul(answers, "urgency"),
      frustration: scoreUnit(readScore(answers, "frustration")),
      churn: readNoul(answers, "churn"),
      refund: readNoul(answers, "refund"),
      draftPolicy: readNoul(answers, "draft_policy"),
      draftAnswers: readNoul(answers, "draft_answers"),
      followUp: follow.choice,
    });
    return {
      ...decision,
      groups: [
        { title: "Classification", items: [cItem("Issue", issue), cItem("Product", product), cItem("Intent", intent)] },
        { title: "Transcript", items: [nItem("Concrete issue", readNoul(answers, "issue_stated")), nItem("Commitment", readNoul(answers, "commitment")), cItem("Follow-up", follow)] },
        { title: "Signals", items: [nItem("Urgency", readNoul(answers, "urgency")), sItem("Frustration", readScore(answers, "frustration")), nItem("Churn", readNoul(answers, "churn")), nItem("Refund", readNoul(answers, "refund"))] },
        { title: "Draft check", items: [nItem("Matches policy", readNoul(answers, "draft_policy")), nItem("Answers the request", readNoul(answers, "draft_answers"))] },
      ],
    };
  },
};

export const claimsDemo: CaseDemoConfig = {
  slug: "insurance-claims",
  stateNote: "First notice, adjuster notes, and the document list are separate fields.",
  fields: [
    { key: "fnol", label: "First notice of loss", rows: 4 },
    { key: "notes", label: "Adjuster notes", rows: 4 },
    { key: "documents", label: "Documents on file", rows: 3 },
  ],
  thresholds: [
    { key: "fraud", label: "Fraud indicator that escalates", min: 0.3, max: 0.9, step: 0.01, default: claimThresholds.fraud },
    { key: "missing", label: "Missing-info probability that requests documents", min: 0.3, max: 0.9, step: 0.01, default: claimThresholds.missing },
    { key: "straightThrough", label: "Complexity at or below which straight-through is allowed", min: 0.15, max: 0.7, step: 0.01, default: claimThresholds.straightThrough },
    { key: "confidence", label: "Peril confidence required to avoid a specialist", min: 0.3, max: 0.9, step: 0.01, default: claimThresholds.confidence },
  ],
  samples: [
    {
      id: "water",
      title: "Kitchen leak, file is thin",
      blurb: "Simple peril, but the value and the photos are missing.",
      fields: {
        fnol: "Policy HO-2291, effective 2024-02-01. On 2026-04-03 a supply line under the kitchen sink let go. Water sat for about an hour. No injuries.",
        notes: "Insured is calm. One room affected. No prior water claims on this policy. Estimate not yet written.",
        documents: "Policy declarations are on file. No photos. No contractor estimate. No inventory of damaged goods.",
      },
    },
    {
      id: "pressure",
      title: "Backdated theft with pressure",
      blurb: "The loss date is before the policy, and the caller is pushing for a same-day payment.",
      fields: {
        fnol: "New policy AU-100, effective today. Caller says a car was stolen last week, before the effective date, and wants the maximum paid before end of day. The police report number they gave does not match the city they named.",
        notes: "Caller became angry when asked for the report. Story about the location changed between the call and the form.",
        documents: "Application only. No police report. No photos of the vehicle.",
      },
    },
  ],
  request: (fields) =>
    request(fields, {
      peril: choice("What peril does `fnol` describe?", {
        water: "Water or leak",
        theft: "Theft",
        auto: "A vehicle collision",
        liability: "Injury or damage to someone else",
        other: "Another peril or unclear",
      }),
      complexity: score("How complex is this claim given `fnol` and `notes`?", [
        "One cause, one location, no injuries",
        "A few open questions but a standard file",
        "Coverage, causation, or injury is genuinely disputed",
      ]),
      missing_value: noul("Is the value of the loss missing from `fnol`, `notes`, and `documents`?", { true: "No usable value is on file.", false: "A value or estimate is present." }),
      missing_proof: noul("Are proof documents missing, such as photos or a police report the loss would need?", { true: "Expected proof is missing.", false: "The expected proof is present." }),
      missing_timeline: noul("Is the timeline of the loss unclear or inconsistent?", { true: "The timeline is missing or inconsistent.", false: "The timeline is clear." }),
      fraud_timing: noul("Does the loss date sit awkwardly against the policy effective date in a way that is a fraud indicator?", { true: "Timing is a fraud indicator.", false: "Timing is ordinary." }),
      fraud_inconsistent: noul("Are there inconsistent facts across `fnol` and `notes` that are fraud indicators?", { true: "Material facts conflict.", false: "The account is consistent." }),
      fraud_pressure: noul("Is there unusual pressure to pay immediately?", { true: "The insured is pushing for immediate payment.", false: "There is no unusual pressure." }),
    }),
  decide: (answers, _fields, thresholds) => {
    const peril = readChoice(answers, "peril");
    const missing = Math.max(readNoul(answers, "missing_value"), readNoul(answers, "missing_proof"), readNoul(answers, "missing_timeline"));
    const fraud = Math.max(readNoul(answers, "fraud_timing"), readNoul(answers, "fraud_inconsistent"), readNoul(answers, "fraud_pressure"));
    const decision = decideClaim(
      {
        peril: peril.choice,
        perilConfidence: peril.confidence,
        complexity: scoreUnit(readScore(answers, "complexity")),
        missing,
        fraud,
      },
      { fraud: thresholds.fraud, missing: thresholds.missing, straightThrough: thresholds.straightThrough, confidence: thresholds.confidence },
    );
    return {
      ...decision,
      groups: [
        { title: "Classification", items: [cItem("Peril", peril), sItem("Complexity", readScore(answers, "complexity"))] },
        { title: "Missing information", items: [nItem("Value", readNoul(answers, "missing_value")), nItem("Proof", readNoul(answers, "missing_proof")), nItem("Timeline", readNoul(answers, "missing_timeline"))] },
        { title: "Fraud indicators", items: [nItem("Timing", readNoul(answers, "fraud_timing")), nItem("Inconsistency", readNoul(answers, "fraud_inconsistent")), nItem("Pressure to pay", readNoul(answers, "fraud_pressure"))] },
      ],
    };
  },
};

export const crimeDemo: CaseDemoConfig = {
  slug: "financial-crime",
  stateNote: "Narrative, KYC, alert history, and two name strings that may be the same person.",
  fields: [
    { key: "narrative", label: "Transaction narrative", rows: 4 },
    { key: "kyc", label: "KYC file", rows: 3 },
    { key: "alert", label: "Alert history", rows: 3 },
    { key: "name_a", label: "Name on the wire", rows: 2 },
    { key: "name_b", label: "Name on the KYC file", rows: 2 },
  ],
  samples: [
    {
      id: "split",
      title: "Just-under-threshold wires",
      blurb: "Structuring pattern, and the names are close but not identical.",
      fields: {
        narrative: "Four outgoing wires in two days, each for $9,500, to different personal accounts in another region. The customer told the teller they were 'splitting it so the form is shorter.'",
        kyc: "Retail customer since 2019. Occupation listed as teacher. Expected activity under $2,000 a month. Source of funds: salary. No PEP flag on the original file.",
        alert: "Two prior alerts for cash deposits just under $10,000, both closed as 'customer explanation accepted' without documents.",
        name_a: "J. M. Okonkwo-Bell",
        name_b: "Jonathan Okonkwo Bell",
      },
    },
    {
      id: "ordinary",
      title: "Payroll match",
      blurb: "A single transfer that matches the KYC story.",
      fields: {
        narrative: "One $2,400 transfer to a landlord, memo 'April rent', consistent with the standing instruction on file.",
        kyc: "Employed, salary deposits match the transfer history. Source of funds documented. Not a PEP.",
        alert: "No prior alerts.",
        name_a: "Mina Okonkwo",
        name_b: "Mina Okonkwo",
      },
    },
  ],
  request: (fields) =>
    request(fields, {
      structuring: noul("Does `narrative` describe structuring or splitting to avoid a reporting threshold?", { true: "The pattern looks like structuring.", false: "It does not." }),
      unusual: noul("Is `narrative` unusual given the expected activity in `kyc`?", { true: "The activity does not fit the KYC profile.", false: "The activity fits." }),
      source: noul("Is the source of funds in `kyc` inadequate for `narrative`?", { true: "Source of funds does not explain the activity.", false: "Source of funds is adequate." }),
      pep: noul("Does `kyc` or `alert` indicate a politically exposed person or a prior unresolved alert?", { true: "There is a PEP flag or an unresolved prior alert.", false: "Neither is present." }),
      same_entity: noul("Do `name_a` and `name_b` refer to the same person, allowing for initials, hyphens, and word order?", { true: "They are the same person.", false: "They are different people." }),
      evidence: score("How strong is the evidence in `narrative`, `kyc`, and `alert` for a suspicion decision?", ["Thin or missing", "Suggestive but incomplete", "Specific and documented"]),
      relevance: score("How relevant is this alert to financial-crime review, as opposed to an ordinary payment?", ["Ordinary activity", "Worth a look", "Clearly a case for review"]),
    }),
  decide: (answers) => {
    const suspicion = Math.max(readNoul(answers, "structuring"), readNoul(answers, "unusual"), readNoul(answers, "source"), readNoul(answers, "pep"));
    const same = readNoul(answers, "same_entity");
    const decision = decideCrime({
      suspicion,
      sameEntity: same,
      evidence: scoreUnit(readScore(answers, "evidence")),
      relevance: scoreUnit(readScore(answers, "relevance")),
    });
    return {
      ...decision,
      groups: [
        { title: "Suspicious characteristics", items: [nItem("Structuring", readNoul(answers, "structuring")), nItem("Unusual for the profile", readNoul(answers, "unusual")), nItem("Source of funds", readNoul(answers, "source")), nItem("PEP or unresolved alert", readNoul(answers, "pep"))] },
        { title: "Entity match", items: [nItem("Same person", same, "Initials, hyphens, and word order count."), sItem("Evidence quality", readScore(answers, "evidence")), sItem("Alert relevance", readScore(answers, "relevance"))] },
      ],
    };
  },
};

export const legalDemo: CaseDemoConfig = {
  slug: "legal-compliance",
  stateNote: "The requirements are explicit fields. The document is checked against them, not against a vibe.",
  fields: [
    { key: "document", label: "Document", rows: 7 },
    { key: "requirement_a", label: "Requirement A", rows: 2 },
    { key: "requirement_b", label: "Requirement B", rows: 2 },
  ],
  samples: [
    {
      id: "ad",
      title: "Marketing claim",
      blurb: "A disease claim and a missing substantiation requirement.",
      fields: {
        document: "Lumen Sleep Gummies. Cures insomnia in one night. Doctors hate this. No side effects, ever. Buy now.",
        requirement_a: "Health marketing must not claim to cure a disease.",
        requirement_b: "Any performance claim must name a source.",
      },
    },
    {
      id: "contract",
      title: "Short services agreement",
      blurb: "Missing a limitation of liability. The two requirements are about term and privacy.",
      fields: {
        document:
          "Northline will provide the API for one year starting 1 May 2026. Either party may terminate for material breach with 30 days' notice. Fees are $2,000 per month. Northline may use customer data to improve the service. This agreement is governed by Delaware law.",
        requirement_a: "The agreement must state a fixed term or a renewal rule.",
        requirement_b: "Customer data must not be used for model training without a stated limit.",
      },
    },
  ],
  request: (fields) =>
    request(fields, {
      doc_type: choice("What kind of document is `document`?", {
        contract: "A contract or agreement",
        policy: "An internal or customer policy",
        filing: "A regulatory filing",
        marketing: "Marketing or advertising copy",
      }),
      missing_liability: noul("Does `document` omit a limitation of liability that a contract of this kind would normally contain? Answer from the text, and answer no if it is not a contract.", {
        true: "It is a contract and liability is not limited.",
        false: "Liability is addressed, or this is not a contract.",
      }),
      missing_term: noul("Does `document` omit a term, renewal, or end date where one is expected?", { true: "The duration is missing.", false: "Duration is stated or not expected." }),
      prohibited: noul("Does `document` contain a prohibited claim, such as curing a disease or a guaranteed outcome with no limit?", { true: "A prohibited claim is present.", false: "No prohibited claim is present." }),
      violation: noul("Does `document` violate `requirement_a` or `requirement_b` on its face?", { true: "At least one requirement is violated.", false: "The requirements hold." }),
      meets_a: noul("Does `document` satisfy `requirement_a`?", { true: "Requirement A is met.", false: "Requirement A is not met." }),
      meets_b: noul("Does `document` satisfy `requirement_b`?", { true: "Requirement B is met.", false: "Requirement B is not met." }),
    }),
  decide: (answers) => {
    const doc = readChoice(answers, "doc_type");
    const decision = decideLegal({
      docType: doc.choice,
      docConfidence: doc.confidence,
      missing: Math.max(readNoul(answers, "missing_liability"), readNoul(answers, "missing_term")),
      prohibited: readNoul(answers, "prohibited"),
      violation: readNoul(answers, "violation"),
      requirements: [readNoul(answers, "meets_a"), readNoul(answers, "meets_b")],
    });
    return {
      ...decision,
      groups: [
        { title: "Classification", items: [cItem("Document type", doc)] },
        { title: "Clauses and claims", items: [nItem("Missing liability limit", readNoul(answers, "missing_liability")), nItem("Missing term", readNoul(answers, "missing_term")), nItem("Prohibited claim", readNoul(answers, "prohibited")), nItem("Policy violation", readNoul(answers, "violation"))] },
        { title: "Requirements", items: [nItem("Requirement A", readNoul(answers, "meets_a")), nItem("Requirement B", readNoul(answers, "meets_b"))] },
      ],
    };
  },
};

export const commerceDemo: CaseDemoConfig = {
  slug: "ecommerce",
  stateNote: "Code finds candidate spans first. Jev picks among those spans, which is the pre-parsed extraction pattern.",
  fields: [
    { key: "title", label: "Title", rows: 2 },
    { key: "description", label: "Description", rows: 4 },
    { key: "reviews", label: "Reviews", rows: 4 },
  ],
  samples: [
    {
      id: "replica",
      title: "Replica watch",
      blurb: "A brand span is present, and the copy signals a counterfeit.",
      fields: {
        title: "1:1 Rolex Submariner inspired men's watch, black dial, free shipping",
        description: "Super clone. Not the genuine Rolex. AAA quality, looks the same. Comes in a gift box.",
        reviews: "Five reviews posted in the same hour from new accounts, all five stars, all saying 'best replica'.",
      },
    },
    {
      id: "linen",
      title: "Ordinary duvet",
      blurb: "A normal listing with color and size in the text.",
      fields: {
        title: "Northline washed linen duvet cover, sage, queen",
        description: "Stonewashed linen, queen size, mother-of-pearl buttons. Made in Portugal. Machine wash cold.",
        reviews: "One review from a buyer with a two-year history: buttons are sturdy, color matches the photo.",
      },
    },
  ],
  request: (fields) => {
    const text = `${fields.title}\n${fields.description}`;
    const colors = dictionaryHits(text, COLOR_DICTIONARY);
    const brands = dictionaryHits(text, BRAND_DICTIONARY);
    const sizes = patternHits(text, SIZE_PATTERN);
    return request(
      { ...fields, color_candidates: colors, brand_candidates: brands, size_candidates: sizes },
      {
        category: choice("Which catalog category should this listing be normalized to?", {
          apparel: "Clothing, shoes, or soft home textiles",
          electronics: "Electronics",
          beauty: "Beauty or personal care",
          home: "Furniture or hard home goods",
          supplement: "Supplements or ingestibles",
          other: "None of those",
        }),
        color: choice("Which pre-parsed color span is the product color? Candidates are in `color_candidates`.", withNone(colors)),
        brand: choice("Which pre-parsed brand span is the brand the listing claims? Candidates are in `brand_candidates`.", withNone(brands)),
        size: choice("Which pre-parsed size span is the product size? Candidates are in `size_candidates`.", withNone(sizes)),
        prohibited: noul("Is this a prohibited listing, such as a weapon, a drug, or a banned replica?", { true: "The listing is prohibited.", false: "The listing is allowed." }),
        counterfeit: noul("Does the listing signal a counterfeit or a replica of a branded good?", { true: "Counterfeit signals are present.", false: "No counterfeit signal." }),
        review_abuse: noul("Do `reviews` look like review abuse, such as coordinated or fake reviews?", { true: "The reviews look abusive.", false: "The reviews look ordinary." }),
        policy: noul("Does the listing violate a typical marketplace policy against replicas or misleading authenticity?", { true: "It violates that policy.", false: "It does not." }),
        quality: score("How suitable is this listing for prominent search placement, ignoring policy?", ["Poor or misleading", "Acceptable", "Clear, specific, and complete"]),
      },
    );
  },
  decide: (answers) => {
    const category = readChoice(answers, "category");
    const color = readChoice(answers, "color");
    const brand = readChoice(answers, "brand");
    const size = readChoice(answers, "size");
    const decision = decideListing({
      category: category.choice,
      categoryConfidence: category.confidence,
      prohibited: readNoul(answers, "prohibited"),
      counterfeit: readNoul(answers, "counterfeit"),
      reviewAbuse: readNoul(answers, "review_abuse"),
      quality: scoreUnit(readScore(answers, "quality")),
    });
    return {
      ...decision,
      groups: [
        { title: "Normalized category", items: [cItem("Category", category)] },
        { title: "Attributes", items: [cItem("Color", color, "Chosen from pre-parsed spans."), cItem("Brand", brand), cItem("Size", size)] },
        { title: "Policy", items: [nItem("Prohibited", readNoul(answers, "prohibited")), nItem("Counterfeit", readNoul(answers, "counterfeit")), nItem("Review abuse", readNoul(answers, "review_abuse")), nItem("Policy violation", readNoul(answers, "policy"))] },
        { title: "Rank", items: [sItem("Listing quality", readScore(answers, "quality")), mItem("Rank score", decision.rank)] },
      ],
    };
  },
};

export const moderationDemo: CaseDemoConfig = {
  slug: "moderation",
  stateNote: "The company policy is part of the state, so the criteria can be yours rather than a generic toxicity list.",
  fields: [
    { key: "policy", label: "Your moderation policy", rows: 4 },
    { key: "channel", label: "Channel", rows: 2 },
    { key: "post", label: "Post", rows: 5 },
  ],
  thresholds: [
    { key: "blockHarm", label: "Harm required to block", min: 0.4, max: 0.95, step: 0.01, default: moderationThresholds.blockHarm },
    { key: "blockSeverity", label: "Severity required to block", min: 0.3, max: 0.95, step: 0.01, default: moderationThresholds.blockSeverity },
    { key: "blockConfidence", label: "Confidence required to block", min: 0.2, max: 0.9, step: 0.01, default: moderationThresholds.blockConfidence },
    { key: "warnHarm", label: "Harm required to warn", min: 0.2, max: 0.8, step: 0.01, default: moderationThresholds.warnHarm },
    { key: "warnSeverity", label: "Severity required to warn", min: 0.15, max: 0.8, step: 0.01, default: moderationThresholds.warnSeverity },
    { key: "reviewConfidence", label: "Confidence below which the post is reviewed", min: 0.2, max: 0.8, step: 0.01, default: moderationThresholds.reviewConfidence },
  ],
  samples: [
    {
      id: "sdr",
      title: "SDR will not stop",
      blurb: "An opt-out in a sales thread. The policy says opt-outs are honored.",
      fields: {
        policy:
          "Community: no slurs, threats, or scams. Support: no sharing of other customers' data. SDR email: if the person says stop, unsubscribe, or do not contact me, treat it as an opt-out. Mild frustration is not toxicity. Unsafe medical or financial advice is not allowed.",
        channel: "SDR outbound follow-up. The prospect is replying to a sequence.",
        post: "Please stop emailing me. I asked twice. Take me off the list. This is not a request.",
      },
    },
    {
      id: "scam",
      title: "Support scam",
      blurb: "A fake support agent in the community asking for a password.",
      fields: {
        policy: "No one may ask users for passwords, one-time codes, or to move the conversation off-platform to get a refund. Threats and slurs are blocked.",
        channel: "Community forum, a thread titled 'refund never arrived'.",
        post: "I am Northline support. Send me your password and the one-time code so I can refund you faster. Message me on telegram @refund-desk.",
      },
    },
    {
      id: "heat",
      title: "Frustrated, still allowed",
      blurb: "Rude, but inside the policy. Severity should land on a warning or an allow.",
      fields: {
        policy: "Insults without threats can be warned. Threats, slurs, doxxing, and scams are blocked. Complaints about the product are allowed.",
        channel: "Customer support chat.",
        post: "This checkout is garbage and I have wasted an hour. Fix the bug. I am not threatening anyone, I just want the thing I paid for.",
      },
    },
  ],
  request: (fields) =>
    request(fields, {
      channel: choice("Which channel is `channel`?", {
        community: "A community or social surface",
        support: "Customer support",
        sdr: "Sales or SDR outreach",
        other: "Another channel",
      }),
      toxicity: noul("Is `post` toxic under `policy`?", { true: "The policy would call it toxic.", false: "It would not." }),
      harassment: noul("Is `post` harassment under `policy`?", { true: "It targets a person.", false: "It does not." }),
      spam: noul("Is `post` spam under `policy`?", { true: "It is unsolicited promotion or repetitive junk.", false: "It is not." }),
      fraud: noul("Is `post` a fraud or scam under `policy`?", { true: "It tries to deceive or phish.", false: "It does not." }),
      unsafe: noul("Does `post` give unsafe medical, legal, or financial advice that `policy` forbids?", { true: "Unsafe advice is present.", false: "It is not." }),
      pii: noul("Does `post` expose personal data the policy protects?", { true: "Personal data is exposed.", false: "It is not." }),
      opt_out: noul("Is `post` an opt-out request such as stop, unsubscribe, or do not contact me?", { true: "It is an opt-out.", false: "It is not." }),
      policy_violation: noul("Does `post` violate `policy` in a way the other checks might miss?", { true: "It violates the policy.", false: "It does not." }),
      severity: score("How severe is `post` under `policy`?", ["No action needed", "A warning or a limit would do", "Remove or block"]),
    }),
  decide: (answers, _fields, thresholds) => {
    const channel = readChoice(answers, "channel");
    const severity = readScore(answers, "severity");
    const decision = decideModeration(
      {
        toxicity: readNoul(answers, "toxicity"),
        harassment: readNoul(answers, "harassment"),
        spam: readNoul(answers, "spam"),
        fraud: readNoul(answers, "fraud"),
        unsafeAdvice: readNoul(answers, "unsafe"),
        personalData: readNoul(answers, "pii"),
        optOut: readNoul(answers, "opt_out"),
        policyViolation: readNoul(answers, "policy_violation"),
        severity: scoreUnit(severity),
        severityConfidence: severity.confidence,
      },
      {
        ...moderationThresholds,
        blockHarm: thresholds.blockHarm,
        blockSeverity: thresholds.blockSeverity,
        blockConfidence: thresholds.blockConfidence,
        warnHarm: thresholds.warnHarm,
        warnSeverity: thresholds.warnSeverity,
        reviewConfidence: thresholds.reviewConfidence,
      },
    );
    return {
      ...decision,
      plot: { xLabel: "Severity", yLabel: "Confidence", x: scoreUnit(severity), y: severity.confidence, action: decision.action },
      groups: [
        { title: "Channel", items: [cItem("Where this was said", channel)] },
        {
          title: "Detectors",
          items: [
            nItem("Toxicity", readNoul(answers, "toxicity")),
            nItem("Harassment", readNoul(answers, "harassment")),
            nItem("Spam", readNoul(answers, "spam")),
            nItem("Fraud", readNoul(answers, "fraud")),
            nItem("Unsafe advice", readNoul(answers, "unsafe")),
            nItem("Personal data", readNoul(answers, "pii")),
            nItem("Opt-out", readNoul(answers, "opt_out")),
            nItem("Other policy violation", readNoul(answers, "policy_violation")),
            sItem("Severity", severity),
          ],
        },
      ],
    };
  },
};

export const advertisingDemo: CaseDemoConfig = {
  slug: "advertising",
  stateNote: "Copy, the landing page it points at, and the placement.",
  fields: [
    { key: "copy", label: "Ad copy", rows: 3 },
    { key: "landing", label: "Landing page", rows: 4 },
    { key: "placement", label: "Placement", rows: 2 },
  ],
  samples: [
    {
      id: "cure",
      title: "A cure claim next to a kids' video",
      blurb: "Prohibited disease claim, and the placement is a poor audience fit.",
      fields: {
        copy: "Lumen gummies cure diabetes in a week. No diet needed. Guaranteed.",
        landing: "A product page for vitamin gummies. Ingredients: magnesium, chamomile. No clinical citation. The buy button says 'sleep support', not diabetes.",
        placement: "Pre-roll on a children's cartoon channel.",
      },
    },
    {
      id: "linen",
      title: "A plain product ad",
      blurb: "The ad and the page describe the same duvet.",
      fields: {
        copy: "Washed linen duvet covers in sage and ivory. Free returns within 30 days.",
        landing: "Northline duvet cover, washed linen, sage or ivory, queen or king. Free returns within 30 days. Price $180.",
        placement: "A home-design newsletter read by adults.",
      },
    },
  ],
  request: (fields) =>
    request(fields, {
      brand_safety: choice("How brand-safe is `copy` in `placement`?", {
        safe: "Ordinary commercial content for this placement",
        sensitive: "Legal, but a sensitive category for this placement",
        unsafe: "Unsafe or inappropriate for this placement",
      }),
      audience: score("How suitable is the audience implied by `placement` for `copy`?", ["Wrong audience", "Acceptable with limits", "A natural fit"]),
      regulated: noul("Does `copy` make a regulated claim, such as curing a disease or a guaranteed financial return?", { true: "A regulated claim is present.", false: "No regulated claim." }),
      prohibited: noul("Does `copy` contain a prohibited claim that `landing` does not substantiate?", { true: "The claim is prohibited or unsubstantiated.", false: "The claim is allowed." }),
      quality: score("How good is `copy` as an ad, on clarity and specificity?", ["Vague or misleading", "Clear enough", "Specific and well made"]),
      alignment: noul("Does `copy` match what `landing` actually offers?", { true: "The ad and the page agree.", false: "The ad promises something the page does not." }),
    }),
  decide: (answers) => {
    const safety = readChoice(answers, "brand_safety");
    const decision = decideAd({
      brandSafety: safety.choice,
      audience: scoreUnit(readScore(answers, "audience")),
      regulated: readNoul(answers, "regulated"),
      prohibited: readNoul(answers, "prohibited"),
      quality: scoreUnit(readScore(answers, "quality")),
      alignment: readNoul(answers, "alignment"),
    });
    return {
      ...decision,
      groups: [
        { title: "Brand safety and audience", items: [cItem("Brand safety", safety), sItem("Audience suitability", readScore(answers, "audience"))] },
        { title: "Claims", items: [nItem("Regulated claim", readNoul(answers, "regulated")), nItem("Prohibited or unsubstantiated", readNoul(answers, "prohibited"))] },
        { title: "Creative", items: [sItem("Creative quality", readScore(answers, "quality")), nItem("Ad matches the landing page", readNoul(answers, "alignment"))] },
      ],
    };
  },
};

export const gamingDemo: CaseDemoConfig = {
  slug: "gaming",
  stateNote: "A report, the chat it points at, a review, and the support conversation.",
  fields: [
    { key: "report", label: "Player report", rows: 3 },
    { key: "chat", label: "In-game chat", rows: 3 },
    { key: "review", label: "Review", rows: 3 },
    { key: "support", label: "Support conversation", rows: 3 },
  ],
  samples: [
    {
      id: "abuse",
      title: "Targeted harassment",
      blurb: "The report matches the chat. This is a moderation route.",
      fields: {
        report: "Player 'keel' followed me across three matches and told me to quit. I have clips.",
        chat: "keel: uninstall. keel: nobody wants you in this lobby. keel: I'll be in your next match too.",
        review: "Matchmaking is fine. The report tools are slow.",
        support: "Player: this has happened all week and I don't want to log in. Agent: I can escalate to player moderation.",
      },
    },
    {
      id: "churn",
      title: "Quiet churn",
      blurb: "No abuse. The review and the support note say they are leaving.",
      fields: {
        report: "No report. The player opened a billing thread.",
        chat: "gg. rematch? nice save at the end.",
        review: "I loved the first season. The new pass is too grindy and I'm done after this month.",
        support: "Player: please cancel renewal. I haven't logged in for nine days. Agent: I can cancel and offer a pause.",
      },
    },
  ],
  request: (fields) =>
    request(fields, {
      report_type: choice("What is `report` mainly about? Use the other fields if the report is empty.", {
        cheating: "Cheating or suspicious play",
        toxicity: "Harassment or abusive chat",
        bug: "A bug or a technical problem",
        billing: "Billing, cancellation, or the store",
        none: "There is no real report",
      }),
      abuse: noul("Does `chat` contain abuse or harassment?", { true: "The chat is abusive.", false: "The chat is ordinary." }),
      toxicity: noul("Is `chat` toxic beyond ordinary competition?", { true: "It is toxic.", false: "It is not." }),
      suspicious: noul("Does `report` or `chat` describe suspicious play such as cheating?", { true: "Cheating or collusion is alleged with some basis.", false: "No." }),
      frustration: score("How frustrated is the player across `review` and `support`?", ["Content", "Annoyed", "Ready to leave"]),
      engagement: score("How engaged does the player still sound?", ["Checked out", "Uneven", "Still invested in the game"]),
      churn: noul("Is there a churn signal in `review` or `support`?", { true: "They may stop playing or paying.", false: "No churn signal." }),
    }),
  decide: (answers) => {
    const report = readChoice(answers, "report_type");
    const decision = decidePlayer({
      abuse: readNoul(answers, "abuse"),
      toxicity: readNoul(answers, "toxicity"),
      suspicious: readNoul(answers, "suspicious"),
      frustration: scoreUnit(readScore(answers, "frustration")),
      engagement: scoreUnit(readScore(answers, "engagement")),
      churn: readNoul(answers, "churn"),
      reportType: report.choice,
    });
    return {
      ...decision,
      groups: [
        { title: "Report", items: [cItem("Report type", report)] },
        { title: "Chat", items: [nItem("Abuse", readNoul(answers, "abuse")), nItem("Toxicity", readNoul(answers, "toxicity")), nItem("Suspicious play", readNoul(answers, "suspicious"))] },
        { title: "Player state", items: [sItem("Frustration", readScore(answers, "frustration")), sItem("Engagement", readScore(answers, "engagement")), nItem("Churn", readNoul(answers, "churn"))] },
      ],
    };
  },
};

export const riskDemo: CaseDemoConfig = {
  slug: "risk-assessment",
  stateNote: "The note can be an incident, a claim, a transaction, or a vendor review. The feature vector is what a downstream model would see.",
  fields: [
    { key: "context", label: "Underwriting context", rows: 3 },
    { key: "report", label: "Report", rows: 6 },
  ],
  samples: [
    {
      id: "vendor",
      title: "Vendor with a quiet subprocessors list",
      blurb: "Operational and cyber risk. The disclosure gap is the point.",
      fields: {
        context: "Commercial package for a marketplace. We decline vendors who cannot name subprocessors, and we price cyber higher when incident response is untested.",
        report:
          "Vendor assessment, Oak Kiln Hosting. They process cardholder-adjacent logs. Asked for subprocessors, they said 'a cloud, the usual ones' and did not name them. Last incident drill was 'sometime in 2023'. No breaches disclosed. Access reviews are annual. A sales engineer offered a 20% discount if we skipped the security questionnaire.",
      },
    },
    {
      id: "slip",
      title: "A straightforward slip",
      blurb: "Low severity, documented, no odd pressure.",
      fields: {
        context: "Small commercial property. Slip-and-fall claims under $5,000 with a report and no injury dispute can be monitored.",
        report: "Claim note: customer slipped on a marked wet floor, declined medical care, and signed the incident card. Cleanup log shows the sign was out. No prior claims this year.",
      },
    },
  ],
  request: (fields) =>
    request(fields, {
      risk_type: choice("What risk type best fits `report` given `context`?", {
        operational: "Operations, process, or service failure",
        credit: "Credit or ability to pay",
        fraud: "Fraud or misrepresentation",
        compliance: "A legal or compliance gap",
        cyber: "Security or privacy",
      }),
      suspicious: noul("Does `report` contain suspicious characteristics, such as pressure to skip a control?", { true: "Something suspicious is present.", false: "Nothing suspicious stands out." }),
      severity: score("How severe is the risk in `report` for the decision in `context`?", ["Immaterial", "Material but manageable", "Severe enough to change the decision now"]),
      control: noul("Does `report` describe a weak or missing control?", { true: "A control is weak or missing.", false: "Controls look adequate." }),
      velocity: noul("Does `report` describe a fast-moving or repeated pattern?", { true: "The pattern is fast or repeated.", false: "It is a single ordinary event." }),
      disclosure: noul("Is there a disclosure gap in `report`?", { true: "Expected information was withheld or vague.", false: "Disclosure is adequate." }),
    }),
  decide: (answers) => {
    const risk = readChoice(answers, "risk_type");
    const decision = decideRisk({
      riskType: risk.choice,
      suspicious: readNoul(answers, "suspicious"),
      severity: scoreUnit(readScore(answers, "severity")),
      controlWeakness: readNoul(answers, "control"),
      velocity: readNoul(answers, "velocity"),
      disclosureGap: readNoul(answers, "disclosure"),
    });
    return {
      ...decision,
      groups: [
        { title: "Risk type", items: [cItem("Type", risk), nItem("Suspicious characteristics", readNoul(answers, "suspicious")), sItem("Severity", readScore(answers, "severity"))] },
        { title: "Feature vector", items: decision.features.map((feature) => mItem(feature.name, feature.value, "A column for a downstream model.")) },
        { title: "Priority", items: [mItem("Priority", decision.priority), fItem("Queue", decision.destination)] },
      ],
    };
  },
};

export const operationDemos: CaseDemoConfig[] = [
  recruitingDemo,
  leadsDemo,
  supportDemo,
  claimsDemo,
  crimeDemo,
  legalDemo,
  commerceDemo,
  moderationDemo,
  advertisingDemo,
  gamingDemo,
  riskDemo,
];
