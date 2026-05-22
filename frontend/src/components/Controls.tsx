import type React from "react";

const SPEEDS = [0.25, 0.5, 1, 2, 4, 8] as const;

interface Props {
  stepIndex: number;
  totalSteps: number;
  playing: boolean;
  speed: number;
  onStepBack: () => void;
  onStepForward: () => void;
  onPlayPause: () => void;
  onSpeedChange: (s: number) => void;
  onScrub: (i: number) => void;
}

const btn: React.CSSProperties = {
  background: "#1e2433",
  border: "1px solid #2d3748",
  color: "#e2e8f0",
  borderRadius: 4,
  padding: "4px 12px",
  cursor: "pointer",
  fontSize: 13,
};

export function Controls({
  stepIndex,
  totalSteps,
  playing,
  speed,
  onStepBack,
  onStepForward,
  onPlayPause,
  onSpeedChange,
  onScrub,
}: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button style={btn} onClick={onStepBack} disabled={stepIndex === 0}>
          ◀◀
        </button>
        <button style={{ ...btn, minWidth: 64 }} onClick={onPlayPause}>
          {playing ? "⏸" : "▶"}
        </button>
        <button
          style={btn}
          onClick={onStepForward}
          disabled={stepIndex >= totalSteps - 1}
        >
          ▶▶
        </button>

        <span style={{ marginLeft: 12, fontSize: 12, color: "#94a3b8" }}>
          step {stepIndex + 1} / {totalSteps}
        </span>

        <div style={{ marginLeft: "auto", display: "flex", gap: 4, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "#64748b" }}>speed</span>
          {SPEEDS.map((s) => (
            <button
              key={s}
              style={{
                ...btn,
                background: s === speed ? "#2d3748" : "#1e2433",
                color: s === speed ? "#93c5fd" : "#94a3b8",
                padding: "2px 8px",
                fontSize: 11,
              }}
              onClick={() => onSpeedChange(s)}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      <input
        type="range"
        min={0}
        max={Math.max(0, totalSteps - 1)}
        value={stepIndex}
        onChange={(e) => onScrub(Number(e.target.value))}
        style={{ width: "100%", accentColor: "#3b82f6" }}
      />
    </div>
  );
}
