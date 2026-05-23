import { useEffect, useState } from "react";
import { getStats } from "../api";
import type { ExperimentSummary, StatsResult } from "../types";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AggregationRangeBar({
  avgMin,
  avgMax,
}: {
  avgMin: number;
  avgMax: number;
}) {
  const leftPct = (avgMin * 100).toFixed(1);
  const rightPct = (avgMax * 100).toFixed(1);
  const barLeft = avgMin * 100;
  const barWidth = Math.max(0, (avgMax - avgMin) * 100);

  return (
    <div>
      {/* Big numbers */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginBottom: 10,
        }}
      >
        <div>
          <div style={{ fontSize: 10, color: "#64748b", marginBottom: 2 }}>
            Avg Min
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#10b981", lineHeight: 1 }}>
            {leftPct}%
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: "#64748b", marginBottom: 2 }}>
            Avg Max
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#6366f1", lineHeight: 1 }}>
            {rightPct}%
          </div>
        </div>
      </div>

      {/* Range bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 10, color: "#475569", flexShrink: 0 }}>0%</span>
        <div
          style={{
            flex: 1,
            height: 10,
            background: "#1e2433",
            borderRadius: 5,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `${barLeft}%`,
              width: `${barWidth}%`,
              background: "linear-gradient(90deg, #10b981, #6366f1)",
              borderRadius: 5,
            }}
          />
        </div>
        <span style={{ fontSize: 10, color: "#475569", flexShrink: 0 }}>100%</span>
      </div>
    </div>
  );
}

function ExperimentsTable({ experiments }: { experiments: ExperimentSummary[] }) {
  const cellStyle: React.CSSProperties = {
    padding: "5px 8px",
    textAlign: "right",
    borderBottom: "1px solid #1e2433",
    fontSize: 12,
    color: "#94a3b8",
  };
  const headerStyle: React.CSSProperties = {
    ...cellStyle,
    color: "#475569",
    fontWeight: 600,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...headerStyle, textAlign: "left" }}>ID</th>
            <th style={{ ...headerStyle, textAlign: "left" }}>Status</th>
            <th style={headerStyle}>Min Agg</th>
            <th style={headerStyle}>Max Agg</th>
            <th style={headerStyle}>Steps</th>
          </tr>
        </thead>
        <tbody>
          {experiments.map((exp) => (
            <tr key={exp.id}>
              <td
                style={{
                  ...cellStyle,
                  textAlign: "left",
                  fontFamily: "monospace",
                  color: "#64748b",
                }}
              >
                {exp.id}
              </td>
              <td style={{ ...cellStyle, textAlign: "left" }}>
                {exp.status === "done" ? (
                  <span style={{ color: "#34d399" }}>✓ done</span>
                ) : (
                  <span style={{ color: "#f87171" }}>✗ aborted</span>
                )}
              </td>
              <td style={{ ...cellStyle, color: "#10b981" }}>
                {(exp.min_aggregation * 100).toFixed(1)}%
              </td>
              <td style={{ ...cellStyle, color: "#6366f1" }}>
                {(exp.max_aggregation * 100).toFixed(1)}%
              </td>
              <td style={cellStyle}>{exp.step_count.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface StatsPanelProps {
  n: number;
  frozenPct: number;
  /** Increment this key to force a re-fetch (e.g. after an experiment finishes). */
  refreshKey: number;
}

export function StatsPanel({ n, frozenPct, refreshKey }: StatsPanelProps) {
  const [stats, setStats] = useState<StatsResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getStats(n, frozenPct).then((result) => {
      if (!cancelled) {
        setStats(result);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [n, frozenPct, refreshKey]);

  const dimText: React.CSSProperties = { fontSize: 12, color: "#64748b" };
  const label: React.CSSProperties = {
    fontSize: 10,
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  };

  if (loading) {
    return (
      <div style={{ ...dimText, padding: "8px 0" }}>Loading statistics…</div>
    );
  }

  if (!stats || stats.total_experiments === 0) {
    return (
      <div style={{ ...dimText, fontStyle: "italic", padding: "8px 0" }}>
        No experiments yet for n&nbsp;=&nbsp;{n}, frozen&nbsp;=&nbsp;
        {(frozenPct * 100).toFixed(0)}%.&nbsp; Run one to start collecting
        stats.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Aggregation range block */}
      <div
        style={{
          background: "#0f1117",
          border: "1px solid #1e2433",
          borderRadius: 6,
          padding: 16,
        }}
      >
        <div style={{ ...label, marginBottom: 14 }}>
          Aggregation % range across runs
        </div>
        <AggregationRangeBar
          avgMin={stats.avg_min_aggregation}
          avgMax={stats.avg_max_aggregation}
        />
      </div>

      {/* Secondary stats row */}
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <div>
          <div style={label}>Total runs</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#e2e8f0", marginTop: 2 }}>
            {stats.total_experiments}
          </div>
          <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>
            {stats.completed} done · {stats.aborted} aborted
          </div>
        </div>

        <div>
          <div style={label}>Steps to finish</div>
          <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 4, lineHeight: 1.6 }}>
            <span>avg </span>
            <span style={{ color: "#e2e8f0", fontWeight: 600 }}>
              {Math.round(stats.step_count.mean).toLocaleString()}
            </span>
            {"  ·  "}
            <span>min </span>
            <span style={{ color: "#e2e8f0", fontWeight: 600 }}>
              {stats.step_count.min.toLocaleString()}
            </span>
            {"  ·  "}
            <span>max </span>
            <span style={{ color: "#e2e8f0", fontWeight: 600 }}>
              {stats.step_count.max.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Per-experiment table */}
      <div>
        <div style={{ ...label, marginBottom: 8 }}>Recent experiments</div>
        <ExperimentsTable experiments={stats.experiments} />
      </div>
    </div>
  );
}
