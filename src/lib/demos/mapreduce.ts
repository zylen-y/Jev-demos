import type { Trace } from "../corpus";
import { choice, noul, request } from "../jev/questions";
import type { SystemOneRequest } from "../jev/types";

export function traceRequest(trace: Trace, query: string): SystemOneRequest {
  const questions: SystemOneRequest["questions"] = {
    outcome: choice("What best describes the outcome of this agent trace?", {
      succeeded: "The task finished and the reply matches the tools and policy",
      tool_error: "A tool failed and the trace records that failure",
      hallucination: "The agent stated a fact the tools or the policy do not support",
      policy_issue: "The agent broke a policy even if the tools worked",
      incomplete: "The trace stops before an outcome",
    }),
    needs_review: noul("Should a human review this trace?", {
      true: "A person should look, because of a policy issue, a hallucination, or an unfinished task.",
      false: "The trace is a clean success or a recorded tool error with no invented facts.",
    }),
  };
  if (query.trim()) {
    questions.matches_query = noul(`Does this trace contain the situation described here: ${query.trim()}`, {
      true: "The trace matches that description.",
      false: "The trace does not match.",
    });
  }
  return request({ trace_id: trace.id, text: trace.text, query: query.trim() || null }, questions);
}
