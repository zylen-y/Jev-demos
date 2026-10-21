import { cellTone, type JudgedRow, type RelayAction } from "./judge";

const SOLID: Record<RelayAction, string> = {
  keep: "#1f8f52",
  review: "#e2a23a",
  revert: "#ff3b1f",
};

export const CHANGED_FILL = "#ff3b1f";
export const MUTED_CHANGE = "#4a403c";

type PaintCell = JudgedRow & { edit?: { title: string; summary: string } };

export function flippedFill(action: RelayAction, markChanges: boolean, toRevert = false): string {
  if (!markChanges) return SOLID[action];
  return toRevert ? CHANGED_FILL : MUTED_CHANGE;
}

export function isFlipToRevert(row: PaintCell): boolean {
  return Boolean(row.before && row.after === "revert" && row.before !== "revert");
}

const HELD: Record<RelayAction, string> = {
  keep: "#173628",
  review: "#3a2c12",
  revert: "#4a1c16",
};

export function fieldGaps(width: number): { x: number; y: number } {
  if (width < 700) return { x: 1, y: 1.5 };
  return { x: 1.5, y: 3 };
}

/** Column count that keeps every backlog row at least a few pixels tall. */
export function columnsFor(width: number, height: number, count: number): number {
  if (count <= 0) return 1;
  const gap = fieldGaps(width).y;
  const minCell = 6;
  const maxRows = Math.max(1, Math.floor((Math.max(height, minCell) + gap) / (minCell + gap)));
  const minCols = Math.max(1, Math.ceil(count / maxRows));
  const preferred = width < 560 ? 16 : width < 960 ? 32 : 48;
  const maxCols = Math.max(1, Math.floor(Math.max(width, 4) / 4));
  return Math.min(maxCols, Math.max(preferred, minCols));
}

export function paintRelayField(
  ctx: CanvasRenderingContext2D,
  options: {
    width: number;
    height: number;
    dpr: number;
    cells: readonly PaintCell[];
    revealed: number;
    columns: number;
    /** Bright red marks a flip to revert. Any other change stays muted. */
    markChanges?: boolean;
  },
): void {
  const { width, height, dpr, cells, revealed, columns, markChanges = false } = options;
  const cols = Math.max(1, columns);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#100e0c";
  ctx.fillRect(0, 0, width, height);
  if (cells.length === 0 || width <= 0 || height <= 0) return;

  const rows = Math.ceil(cells.length / cols);
  const gaps = fieldGaps(width);
  const cellW = (width - gaps.x * (cols - 1)) / cols;
  const cellH = (height - gaps.y * (rows - 1)) / rows;
  const radius = Math.min(1.6, cellW / 2, Math.max(0, cellH / 2));

  const rings: { x: number; y: number; w: number; h: number }[] = [];
  for (let index = 0; index < cells.length; index += 1) {
    const row = cells[index];
    if (!row) continue;
    const column = index % cols;
    const line = Math.floor(index / cols);
    const x = column * (cellW + gaps.x);
    const y = line * (cellH + gaps.y);
    const tone = cellTone(row, index, revealed);
    const failed = index < revealed && row.after == null && row.failed === true;
    let fill = "#1a1814";
    let inset = 0;
    if (failed) {
      fill = "#3a3632";
    } else if (tone === "flipped" && row.after) {
      const hero = markChanges && isFlipToRevert(row);
      fill = flippedFill(row.after, markChanges, hero);
      if (!markChanges || hero) rings.push({ x, y, w: cellW, h: cellH });
    } else if (tone === "unchanged" && row.before) {
      fill = HELD[row.before];
      inset = Math.min(cellW, cellH) * 0.2;
    } else if (row.before) {
      fill = SOLID[row.before];
    }
    ctx.beginPath();
    ctx.roundRect(x + inset, y + inset, Math.max(0.5, cellW - inset * 2), Math.max(0.5, cellH - inset * 2), radius);
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.strokeStyle = "#fff8f2";
  ctx.lineWidth = 1.25;
  for (const ring of rings) {
    ctx.beginPath();
    ctx.roundRect(ring.x, ring.y, Math.max(0.5, ring.w), Math.max(0.5, ring.h), radius);
    ctx.stroke();
  }

  if (revealed > 0 && revealed < cells.length) {
    const line = Math.floor(revealed / cols);
    const y = line * (cellH + gaps.y);
    const glow = ctx.createLinearGradient(0, y - 28, 0, y);
    glow.addColorStop(0, "rgba(255,59,31,0)");
    glow.addColorStop(1, "rgba(255,59,31,0.38)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, Math.max(0, y - 28), width, Math.min(28, y));
    ctx.fillStyle = "rgba(255,244,232,0.95)";
    ctx.fillRect(0, Math.max(0, y - 1), width, 2);
  }
}
