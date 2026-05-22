export type Algotype = "bubble" | "insertion" | "selection" | "unknown";
export type CellStatus = "active" | "frozen";

export interface CellSnapshot {
  pos: number;
  value: number;
  algotype: Algotype;
  status: CellStatus;
}

export interface StepMetrics {
  sortedness: number;
  monotonicity_error: number;
  aggregation: number;
}

export interface Step {
  step: number;
  cells: CellSnapshot[];
  metrics: StepMetrics;
}

export interface AlgotypeRatios {
  bubble: number;
  insertion: number;
  selection: number;
}

export interface ExperimentConfig {
  n: number;
  algotype_ratios: AlgotypeRatios;
  frozen_pct: number;
  seed?: number;
}

export interface ExperimentStatus {
  id: string;
  status: "running" | "done";
  step_count: number;
}
