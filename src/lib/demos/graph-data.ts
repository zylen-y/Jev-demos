import { HIERARCHY } from "../graph";
import { choice, noul, request } from "../jev/questions";
import type { SystemOneRequest } from "../jev/types";

export type GraphNode = { id: string; label: string };

export const GRAPH_NODES: GraphNode[] = [
  { id: "nl2", label: "NL-2" },
  { id: "trial", label: "Trial 4" },
  { id: "loam", label: "Loam set" },
  { id: "yield", label: "Yield note" },
  { id: "assay", label: "Nitrogenase assay" },
  { id: "okonkwo", label: "I. Okonkwo" },
  { id: "lab", label: "Northline Lab" },
  { id: "paper", label: "Drought paper" },
  { id: "irrigation", label: "Irrigation claim" },
];

export const GRAPH_EDGES: { id: string; source: string; target: string; hint: string }[] = [
  { id: "e1", source: "trial", target: "nl2", hint: "Trial 4 tested the strain." },
  { id: "e2", source: "trial", target: "loam", hint: "Trial 4 was run on the loam plots." },
  { id: "e3", source: "assay", target: "yield", hint: "The assay is offered as support for the yield note." },
  { id: "e4", source: "okonkwo", target: "trial", hint: "Okonkwo ran the trial." },
  { id: "e5", source: "okonkwo", target: "lab", hint: "Okonkwo is at Northline Lab." },
  { id: "e6", source: "paper", target: "trial", hint: "The drought paper cites the trial." },
  { id: "e7", source: "irrigation", target: "yield", hint: "The irrigation claim conflicts with the yield note." },
  { id: "e8", source: "yield", target: "trial", hint: "The yield note reports Trial 4." },
];

export const DEFAULT_PACKET = {
  records:
    "Trial 4, run by I. Okonkwo at Northline Lab, tested Pseudomonas strain NL-2 on the loam set. The yield note says treated plots produced 11% more grain. A nitrogenase assay was higher in treated roots and is cited beside that note. The drought paper cites Trial 4. A separate irrigation claim says the gain disappears when water is held constant, which the yield note does not address.",
  irrigation_claim: "The yield gain disappears when irrigation is held constant, so NL-2 did not raise yield.",
  yield_note: "Treated plots produced 11% more grain than untreated plots.",
};

const relation = {
  supports: "The source supports the target",
  uses: "The source uses or tests the target",
  authored: "The source authored or ran the target",
  affiliated_with: "The source is affiliated with the target",
  cites: "The source cites the target",
  contradicts: "The source contradicts the target",
  none: "No meaningful relation of those kinds",
};

const entity = {
  organism: "A strain, species, or cell line",
  method: "A procedure or assay",
  dataset: "A dataset or set of plots",
  person: "A person",
  organization: "A lab or company",
  paper: "A paper",
  finding: "A result or claim",
};

export function graphRequest(packet: typeof DEFAULT_PACKET): SystemOneRequest {
  const questions: SystemOneRequest["questions"] = {
    contradiction: noul("Does `irrigation_claim` contradict `yield_note`?", {
      true: "They cannot both be taken at face value.",
      false: "They are compatible.",
    }),
    domain: choice("Which top-level domain best classifies this packet?", {
      biology: "Organisms, assays, or field biology",
      materials: "Catalysts, polymers, or solvents",
      methods: "Statistics, protocols, or instruments as the subject",
    }),
  };
  for (const node of GRAPH_NODES) {
    questions[`type_${node.id}`] = choice(`What entity type is ${node.label} in \`records\`?`, entity);
  }
  for (const edge of GRAPH_EDGES) {
    const source = GRAPH_NODES.find((node) => node.id === edge.source)?.label;
    const target = GRAPH_NODES.find((node) => node.id === edge.target)?.label;
    questions[`rel_${edge.id}`] = choice(
      `How does ${source} relate to ${target}? Context hint: ${edge.hint} Use \`records\`.`,
      relation,
    );
  }
  return request(packet, questions);
}

export function hierarchyRequest(domain: string, packet: string): SystemOneRequest {
  const children = HIERARCHY[domain] ?? HIERARCHY.biology;
  return request(
    { domain, packet },
    {
      subtype: choice(`Within ${domain}, which subtype best fits the packet?`, children),
    },
  );
}
