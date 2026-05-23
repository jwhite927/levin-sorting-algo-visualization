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

export interface ExperimentSummary {
  id: string;
  status: "done" | "aborted";
  min_aggregation: number;
  max_aggregation: number;
  final_aggregation: number;
  step_count: number;
  timestamp: number;
}

export interface StepCountStats {
  mean: number;
  min: number;
  max: number;
}

export interface StatsResult {
  n: number;
  frozen_pct: number;
  total_experiments: number;
  completed: number;
  aborted: number;
  /** Average of each experiment's minimum aggregation value */
  avg_min_aggregation: number;
  /** Average of each experiment's maximum aggregation value */
  avg_max_aggregation: number;
  step_count: StepCountStats;
  experiments: ExperimentSummary[];
}
