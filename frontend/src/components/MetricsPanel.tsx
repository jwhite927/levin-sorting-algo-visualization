/**
 * D3-powered line charts for sortedness, monotonicity error, and aggregation.
 * Includes the "delayed gratification" panel: sortedness line with descent
 * segments (temporary regression) highlighted in red.
 */
import { useEffect, useRef } from "react";
import * as d3 from "d3";
import type { Step } from "../types";

interface Props {
  steps: Step[];
  currentIndex: number;
}

const CHART_H = 80;
const CHART_W = 340;

type MetricKey = "sortedness" | "monotonicity_error" | "aggregation";

interface ChartSpec {
  key: MetricKey;
  label: string;
  color: string;
  domain: [number, number];
}

const CHARTS: ChartSpec[] = [
  { key: "sortedness", label: "Sortedness", color: "#3b82f6", domain: [0, 1] },
  {
    key: "monotonicity_error",
    label: "Monotonicity Error",
    color: "#f59e0b",
    domain: [0, 1],
  },
  { key: "aggregation", label: "Aggregation", color: "#10b981", domain: [0, 1] },
];

function useChart(
  ref: React.RefObject<SVGSVGElement>,
  steps: Step[],
  spec: ChartSpec,
  currentIndex: number
) {
  useEffect(() => {
    if (!ref.current || steps.length === 0) return;
    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();

    const mg = { top: 6, right: 12, bottom: 18, left: 32 };
    const w = CHART_W - mg.left - mg.right;
    const h = CHART_H - mg.top - mg.bottom;

    const g = svg
      .append("g")
      .attr("transform", `translate(${mg.left},${mg.top})`);

    const values = steps.map((s) => s.metrics[spec.key] as number);

    const xScale = d3.scaleLinear().domain([0, steps.length - 1]).range([0, w]);
    const maxVal = spec.key === "monotonicity_error"
      ? Math.max(...values, 1)
      : spec.domain[1];
    const yScale = d3
      .scaleLinear()
      .domain([spec.key === "monotonicity_error" ? 0 : spec.domain[0], maxVal])
      .range([h, 0]);

    // Axes
    g.append("g")
      .attr("transform", `translate(0,${h})`)
      .call(d3.axisBottom(xScale).ticks(4).tickSize(2))
      .attr("color", "#475569");

    g.append("g")
      .call(d3.axisLeft(yScale).ticks(3).tickSize(2))
      .attr("color", "#475569");

    // For sortedness: colour descent segments red (delayed gratification)
    if (spec.key === "sortedness") {
      for (let i = 1; i < steps.length; i++) {
        const isDesc = values[i] < values[i - 1];
        g.append("line")
          .attr("x1", xScale(i - 1))
          .attr("y1", yScale(values[i - 1]))
          .attr("x2", xScale(i))
          .attr("y2", yScale(values[i]))
          .attr("stroke", isDesc ? "#ef4444" : spec.color)
          .attr("stroke-width", 1.5)
          .attr("opacity", 0.9);
      }
    } else {
      const line = d3
        .line<number>()
        .x((_, i) => xScale(i))
        .y((v) => yScale(v))
        .curve(d3.curveMonotoneX);

      g.append("path")
        .datum(values)
        .attr("fill", "none")
        .attr("stroke", spec.color)
        .attr("stroke-width", 1.5)
        .attr("d", line);
    }

    // Current-step cursor
    if (currentIndex < steps.length) {
      g.append("line")
        .attr("x1", xScale(currentIndex))
        .attr("y1", 0)
        .attr("x2", xScale(currentIndex))
        .attr("y2", h)
        .attr("stroke", "#e2e8f0")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "3,2")
        .attr("opacity", 0.6);
    }

    // Label
    g.append("text")
      .attr("x", w)
      .attr("y", -2)
      .attr("text-anchor", "end")
      .attr("fill", spec.color)
      .attr("font-size", 10)
      .text(spec.label);
  }, [steps, currentIndex, ref, spec]);
}

function MetricChart({
  steps,
  spec,
  currentIndex,
}: {
  steps: Step[];
  spec: ChartSpec;
  currentIndex: number;
}) {
  const ref = useRef<SVGSVGElement>(null!);
  useChart(ref, steps, spec, currentIndex);
  return (
    <svg
      ref={ref}
      width={CHART_W}
      height={CHART_H}
      style={{ display: "block" }}
    />
  );
}

export function MetricsPanel({ steps, currentIndex }: Props) {
  if (steps.length === 0) return null;
  const cur = steps[currentIndex]?.metrics;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 24, fontSize: 12, color: "#94a3b8" }}>
        {cur && (
          <>
            <span>
              Sortedness:{" "}
              <b style={{ color: "#3b82f6" }}>
                {(cur.sortedness * 100).toFixed(1)}%
              </b>
            </span>
            <span>
              Mono. Error:{" "}
              <b style={{ color: "#f59e0b" }}>{cur.monotonicity_error}</b>
            </span>
            <span>
              Aggregation:{" "}
              <b style={{ color: "#10b981" }}>
                {(cur.aggregation * 100).toFixed(1)}%
              </b>
            </span>
          </>
        )}
      </div>
      {CHARTS.map((spec) => (
        <MetricChart
          key={spec.key}
          steps={steps}
          spec={spec}
          currentIndex={currentIndex}
        />
      ))}
    </div>
  );
}
