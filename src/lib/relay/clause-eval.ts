export type ClauseScore = {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  /** Null when the model never said yes. */
  precision: number | null;
  /** Null when the labeled set has no yes. */
  recall: number | null;
};

export function scoreClause(rows: readonly { aboutElection: boolean; predicted: boolean }[]): ClauseScore {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  for (const row of rows) {
    if (row.predicted && row.aboutElection) tp += 1;
    else if (row.predicted && !row.aboutElection) fp += 1;
    else if (!row.predicted && row.aboutElection) fn += 1;
    else tn += 1;
  }
  const predictedYes = tp + fp;
  const labeledYes = tp + fn;
  return {
    tp,
    fp,
    fn,
    tn,
    precision: predictedYes === 0 ? null : tp / predictedYes,
    recall: labeledYes === 0 ? null : tp / labeledYes,
  };
}
