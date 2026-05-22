import type { ExperimentConfig, ExperimentStatus, Step } from "./types";

const BASE = "/experiments";

export async function createExperiment(
  config: ExperimentConfig
): Promise<{ id: string }> {
  const res = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error(`POST /experiments failed: ${res.status}`);
  return res.json();
}

export async function getExperimentStatus(
  id: string
): Promise<ExperimentStatus> {
  const res = await fetch(`${BASE}/${id}`);
  if (!res.ok) throw new Error(`GET /experiments/${id} failed: ${res.status}`);
  return res.json();
}

export async function getSteps(id: string): Promise<Step[]> {
  const res = await fetch(`${BASE}/${id}/steps`);
  if (!res.ok) throw new Error(`GET /experiments/${id}/steps failed`);
  return res.json();
}

export function openLiveSocket(
  id: string,
  onStep: (step: Step) => void,
  onDone: () => void
): WebSocket {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/experiments/${id}/live`);
  ws.onmessage = (e) => onStep(JSON.parse(e.data) as Step);
  ws.onclose = () => onDone();
  return ws;
}
