import { useCallback, useEffect, useRef, useState } from "react";
import { ArrayView } from "./components/ArrayView";
import { Controls } from "./components/Controls";
import { MetricsPanel } from "./components/MetricsPanel";
import { createExperiment, openLiveSocket } from "./api";
import type { AlgotypeRatios, ExperimentConfig, Step } from "./types";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "#161b27",
        border: "1px solid #1e2433",
        borderRadius: 8,
        padding: 16,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "#475569",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: 12,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function RatioSliders({
  ratios,
  onChange,
}: {
  ratios: AlgotypeRatios;
  onChange: (r: AlgotypeRatios) => void;
}) {
  const ALGOTYPES = ["bubble", "insertion", "selection"] as const;
  const COLORS: Record<string, string> = {
    bubble: "#3b82f6",
    insertion: "#10b981",
    selection: "#f59e0b",
  };

  function setRatio(key: keyof AlgotypeRatios, val: number) {
    const others = ALGOTYPES.filter((k) => k !== key);
    const remaining = Math.max(0, 1 - val);
    const currentSum = others.reduce((s, k) => s + ratios[k], 0);
    const updated = { ...ratios, [key]: val };
    if (currentSum > 0) {
      for (const k of others) {
        updated[k] = (ratios[k] / currentSum) * remaining;
      }
    } else {
      for (const k of others) {
        updated[k] = remaining / others.length;
      }
    }
    onChange(updated);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {ALGOTYPES.map((k) => (
        <label
          key={k}
          style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}
        >
          <span style={{ width: 70, color: COLORS[k] }}>{k}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={ratios[k]}
            onChange={(e) => setRatio(k, Number(e.target.value))}
            style={{ flex: 1, accentColor: COLORS[k] }}
          />
          <span style={{ width: 36, textAlign: "right", color: "#94a3b8" }}>
            {(ratios[k] * 100).toFixed(0)}%
          </span>
        </label>
      ))}
    </div>
  );
}

export default function App() {
  const [config, setConfig] = useState<ExperimentConfig>({
    n: 20,
    algotype_ratios: { bubble: 0.34, insertion: 0.33, selection: 0.33 },
    frozen_pct: 0.0,
  });

  const [steps, setSteps] = useState<Step[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [loading, setLoading] = useState(false);    // true only during POST /experiments
  const [streaming, setStreaming] = useState(false); // true while WS is open
  const [aborted, setAborted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const playTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Playback loop
  useEffect(() => {
    if (!playing) return;
    if (stepIndex >= steps.length - 1) {
      setPlaying(false);
      return;
    }
    playTimer.current = setTimeout(() => {
      setStepIndex((i) => i + 1);
    }, 1000 / speed);
    return () => {
      if (playTimer.current) clearTimeout(playTimer.current);
    };
  }, [playing, stepIndex, steps.length, speed]);

  const handleRun = useCallback(async () => {
    setError(null);
    setAborted(false);
    setLoading(true);
    setStreaming(false);
    setSteps([]);
    setStepIndex(0);
    setPlaying(false);

    // Silence the old socket before closing so its onclose doesn't
    // immediately call setLoading(false) and undo the state we just set.
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    try {
      const { id } = await createExperiment(config);

      const ws = openLiveSocket(
        id,
        (step) => setSteps((prev) => [...prev, step]),
        () => setStreaming(false),
        (_stepCount) => setAborted(true)
      );
      ws.onopen = () => {
        setLoading(false);   // button re-enabled as soon as stream is live
        setStreaming(true);
      };
      ws.onerror = () => {
        setError("WebSocket error — experiment may have failed.");
        setLoading(false);
        setStreaming(false);
      };
      wsRef.current = ws;
    } catch (e) {
      setError(String(e));
      setLoading(false);
    }
  }, [config]);

  const currentStep = steps[stepIndex];

  return (
    <div
      style={{
        maxWidth: 900,
        margin: "0 auto",
        padding: "24px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <h1
        style={{
          fontSize: 18,
          fontWeight: 600,
          color: "#e2e8f0",
          letterSpacing: "0.02em",
        }}
      >
        Chimeric Cell Sorting Visualiser
      </h1>

      <Section title="Experiment Config">
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
            <span style={{ color: "#64748b" }}>N (array size)</span>
            <input
              type="number"
              min={2}
              max={200}
              value={config.n}
              onChange={(e) =>
                setConfig((c) => ({ ...c, n: Number(e.target.value) }))
              }
              style={{
                background: "#0f1117",
                border: "1px solid #2d3748",
                borderRadius: 4,
                color: "#e2e8f0",
                padding: "4px 8px",
                width: 80,
                fontSize: 13,
              }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
            <span style={{ color: "#64748b" }}>
              Frozen % ({(config.frozen_pct * 100).toFixed(0)}%)
            </span>
            <input
              type="range"
              min={0}
              max={0.5}
              step={0.01}
              value={config.frozen_pct}
              onChange={(e) =>
                setConfig((c) => ({ ...c, frozen_pct: Number(e.target.value) }))
              }
              style={{ width: 120, accentColor: "#6366f1" }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
            <span style={{ color: "#64748b" }}>Seed (optional)</span>
            <input
              type="number"
              placeholder="random"
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  seed: e.target.value ? Number(e.target.value) : undefined,
                }))
              }
              style={{
                background: "#0f1117",
                border: "1px solid #2d3748",
                borderRadius: 4,
                color: "#e2e8f0",
                padding: "4px 8px",
                width: 80,
                fontSize: 13,
              }}
            />
          </label>
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}>
            Algotype ratios
          </div>
          <RatioSliders
            ratios={config.algotype_ratios}
            onChange={(r) =>
              setConfig((c) => ({ ...c, algotype_ratios: r }))
            }
          />
        </div>

        <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={handleRun}
            disabled={loading}
            style={{
              background: loading ? "#1e2433" : "#1e3a5f",
              border: "1px solid #3b82f6",
              color: loading ? "#64748b" : "#93c5fd",
              borderRadius: 6,
              padding: "6px 20px",
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {loading ? "Running…" : "Run Experiment"}
          </button>

          {streaming && (
            <span style={{ fontSize: 12, color: "#34d399" }}>● live</span>
          )}
          {error && (
            <span style={{ fontSize: 12, color: "#f87171" }}>{error}</span>
          )}
        </div>
      </Section>

      {aborted && (
        <div
          style={{
            background: "#3b1f1f",
            border: "1px solid #7f1d1d",
            borderRadius: 8,
            padding: "10px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 13,
            color: "#fca5a5",
          }}
        >
          <span>
            ⚠ Experiment aborted after 25,000 steps. The last recorded state is shown below.
          </span>
          <button
            onClick={() => setAborted(false)}
            style={{
              background: "none",
              border: "none",
              color: "#fca5a5",
              cursor: "pointer",
              fontSize: 16,
              lineHeight: 1,
              padding: "0 4px",
            }}
          >
            ×
          </button>
        </div>
      )}

      {steps.length > 0 && (
        <>
          <Section title="Array View">
            {currentStep && (
              <ArrayView cells={currentStep.cells} width={860} height={180} />
            )}
            <div style={{ marginTop: 8 }}>
              <div
                style={{
                  display: "flex",
                  gap: 16,
                  marginBottom: 8,
                  fontSize: 11,
                  color: "#64748b",
                }}
              >
                {[
                  { label: "bubble", color: "hsl(210,70%,47%)" },
                  { label: "insertion", color: "hsl(120,70%,47%)" },
                  { label: "selection", color: "hsl(30,70%,47%)" },
                  { label: "frozen", color: "#555" },
                ].map(({ label, color }) => (
                  <span key={label} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 2,
                        background: color,
                        display: "inline-block",
                      }}
                    />
                    {label}
                  </span>
                ))}
              </div>
              <Controls
                stepIndex={stepIndex}
                totalSteps={steps.length}
                playing={playing}
                speed={speed}
                onStepBack={() => setStepIndex((i) => Math.max(0, i - 1))}
                onStepForward={() =>
                  setStepIndex((i) => Math.min(steps.length - 1, i + 1))
                }
                onPlayPause={() => setPlaying((p) => !p)}
                onSpeedChange={setSpeed}
                onScrub={setStepIndex}
              />
            </div>
          </Section>

          <Section title="Metrics">
            <MetricsPanel steps={steps} currentIndex={stepIndex} />
          </Section>
        </>
      )}
    </div>
  );
}
