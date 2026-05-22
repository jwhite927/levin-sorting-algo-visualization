/**
 * Canvas-based cell array renderer.
 *
 * Visual encoding:
 *   hue        = algotype  (bubble=210°, insertion=120°, selection=30°)
 *   lightness  = cell value (25%–70% relative to array max)
 *   frozen     = grey hatched overlay
 */
import { useEffect, useRef } from "react";
import type { CellSnapshot } from "../types";

const HUE: Record<string, number> = {
  bubble: 210,
  insertion: 120,
  selection: 30,
  unknown: 270,
};

interface Props {
  cells: CellSnapshot[];
  width?: number;
  height?: number;
}

export function ArrayView({ cells, width = 800, height = 160 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || cells.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const n = cells.length;
    const maxValue = Math.max(...cells.map((c) => c.value), 1);
    const cellW = width / n;
    const pad = Math.max(1, cellW * 0.06);

    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < n; i++) {
      const cell = cells[i];
      const hue = HUE[cell.algotype] ?? 270;
      const lightness = 25 + (cell.value / maxValue) * 45;
      const barHeight = (cell.value / maxValue) * (height - 4) + 4;
      const x = i * cellW + pad;
      const w = cellW - pad * 2;
      const y = height - barHeight;

      ctx.fillStyle =
        cell.status === "frozen"
          ? `hsl(0, 0%, ${lightness}%)`
          : `hsl(${hue}, 70%, ${lightness}%)`;
      ctx.fillRect(x, y, w, barHeight);

      if (cell.status === "frozen") {
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = "#888";
        for (let hy = y; hy < height; hy += 6) {
          ctx.fillRect(x, hy, w, 2);
        }
        ctx.restore();
      }
    }
  }, [cells, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ display: "block", borderRadius: 6 }}
    />
  );
}
