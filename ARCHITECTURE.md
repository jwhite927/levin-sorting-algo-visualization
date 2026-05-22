# Chimeric Sorting Visualizer — Architecture

Visualization system for the chimeric cell-view sorting algorithms described in
Zhang, Goldstein & Levin (2024). Animations are step-by-step and browser-native;
Python runs the simulation and produces data only.

---

## Core insight

`StatusProbe.record_sorting_step()` already emits a discrete snapshot per swap.
The seam to exploit: **Python produces step data; the browser consumes and renders it.**
All interpolation and playback control live in the browser.

---

## Layer diagram

```
┌──────────────────────── Kubernetes Cluster ──────────────────────┐
│                                                                   │
│  ┌─────────────────────┐      ┌──────────────────────────────┐   │
│  │  Simulation Jobs    │      │  API Gateway (FastAPI)       │   │
│  │  (Python, ephemeral)│─────►│                              │   │
│  │                     │      │  POST /experiments           │   │
│  │  MultiThreadCell    │      │  GET  /experiments/{id}/steps│   │
│  │  StatusProbe        │      │  WS   /experiments/{id}/live │   │
│  │  → enriched JSON    │      └────────────┬─────────────────┘   │
│  │    snapshots        │                   │                      │
│  └──────┬──────────────┘      ┌────────────▼─────────────────┐   │
│         │                     │  Step Store                  │   │
│         └────────────────────►│  Redis Streams               │   │
│  (pub each step to stream)    │  key: experiment:{id}:steps  │   │
│                               │  (auto-expire, e.g. 1hr)     │   │
│                               └──────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
                          │ WebSocket / SSE
                          │ (or bulk JSON fetch)
┌─────────────────── Browser ──────────────────────────────────────┐
│                                                                   │
│  React + Canvas API (or D3 SVG for smaller N)                    │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  Array View                                              │    │
│  │  ● cells colored by Algotype (bubble/insertion/selection)│    │
│  │  ● brightness = cell value                               │    │
│  │  ● frozen cells: hatched / grey                         │    │
│  │  ● swap in progress: animated translate (Web Anim. API) │    │
│  │  ● aggregation clusters: bracket overlay, same-type runs│    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                   │
│  ┌─────────────────────┐   ┌──────────────────────────────────┐  │
│  │  Metrics Panel      │   │  Controls                        │  │
│  │  Sortedness %       │   │  ◄◄  ►  ►► (step back/fwd)     │  │
│  │  Monotonicity Error │   │  ▐▐ / ▶  (pause/play)           │  │
│  │  Aggregation Value  │   │  speed: 0.25x – 8x              │  │
│  │  Delayed Grat. plot │   │  experiment config (algotypes,   │  │
│  └─────────────────────┘   │  N, frozen %, chimeric ratio)   │  │
│                             └──────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Layer 1 — Simulation (Python, Kubernetes Jobs)

### `cell_research` as a library

The `modules/multithread/` classes already use proper relative imports, so the core
simulation classes are importable once `cell_research`'s parent is on `sys.path`.
Two small additions make it a proper installable package:

**`cell_research/pyproject.toml`** (new file):
```toml
[project]
name = "cell_research"
version = "0.1.0"
```

**`cell_research/__init__.py`** (currently empty — populate it):
```python
from .modules.multithread.BubbleSortCell import BubbleSortCell
from .modules.multithread.SelectionSortCell import SelectionSortCell
from .modules.multithread.InsertionSortCell import InsertionSortCell
from .modules.multithread.MergeSortCell import MergeSortCell
from .modules.multithread.StatusProbe import StatusProbe
from .modules.multithread.CellGroup import CellGroup, GroupStatus
from .modules.multithread.MultiThreadCell import CellStatus
```

The FastAPI service's `Dockerfile` installs it with `pip install -e ./cell_research`.
The `visualization/` directory and `CellWithVisualization.py` are excluded entirely —
they are Tkinter/matplotlib code with no role in the backend service.

### Changes to `cell_research/`

Extend `StatusProbe.record_sorting_step()` to emit richer snapshots. Currently it
stores `[value, ...]`; add per-cell metadata. Maps directly onto
`modules/multithread/MultiThreadCell.py:take_snapshot()` (line 61) — serialize
instead of appending to a list.

```python
# each step:
{
  "step": 42,
  "cells": [
    {"pos": 0, "value": 7, "algotype": "bubble",    "status": "active"},
    {"pos": 1, "value": 3, "algotype": "insertion",  "status": "frozen"},
    ...
  ],
  "metrics": {
    "sortedness":          0.73,
    "monotonicity_error":  4,
    "aggregation":         0.61
  }
}
```

### Kubernetes Job

- One Job per experiment, launched by `POST /experiments`
- Pod runs the same orchestration as `multithread_cell_sorting_steps.py`, publishing
  each snapshot to a Redis Stream via `redis-py`
- Stateless: job completes, steps persist in Redis for the TTL
- 10 simultaneous chimeric experiments = 10 Jobs, no shared state between them

---

## Layer 2 — Transport

Two modes, same data contract:

| Mode | When | Mechanism |
|------|------|-----------|
| **Pre-recorded** | experiment already ran | `GET /experiments/{id}/steps` → bulk JSON → client scrubs |
| **Live stream** | experiment running now | WebSocket → API pod subscribes to Redis Stream → pushes deltas |

Pre-recorded is the default and far simpler for step-by-step scrubbing (back/forward,
variable speed). Live streaming is for long-running chimeric experiments where
emergence is worth watching in real time.

---

## Layer 3 — Browser Rendering

### Why not matplotlib / Tkinter

Both require a display server and produce either static GIFs or non-embeddable windows.
No playback control, no scrubbing, no chimeric Algotype coloring.

### Stack

| Concern | Choice | Reason |
|---------|--------|--------|
| UI state | React | step index, playback, config |
| Cell rendering | Canvas API | handles N=100+ without SVG overhead |
| Position interpolation | Web Animations API | replaces `CellWithVisualization.move()` (line 25–33) |
| Metrics charts | D3 | line charts for sortedness/delayed gratification over time |

### Step playback loop (client-side)

```
steps[] loaded → currentStep index → render(steps[currentStep])
                                   → interpolate via WAAPI
                                   → render(steps[currentStep+1])
```

The server provides discrete state snapshots only. All animation lives in the browser.

### Chimeric-specific visuals

- **Cell hue** = Algotype (blue=bubble, green=insertion, orange=selection)
- **Cell brightness** = cell value (preserves the `1 - 0.01*value` scheme from
  `CellWithVisualization.py`)
- **Frozen cells** — hatched fill or grey overlay; derived from `status: "frozen"`
  in the snapshot
- **Aggregation brackets** — computed per frame from adjacent same-Algotype runs,
  matching the paper's aggregation formula (A = % cells whose neighbors share Algotype)
- **Delayed gratification panel** — sparkline of sortedness over all steps with red
  highlighting on descent segments (temporary sortedness decrease before recovery)

---

## Kubernetes Topology

```
Namespace: sorting-viz
├── Deployment: api-gateway        (2–3 replicas, FastAPI)
├── Deployment: redis              (single instance w/ Streams, or managed)
├── Job (ephemeral): sim-{id}      (one per experiment, TTL 10 min)
├── Ingress: nginx                 (routes /api → gateway, / → static frontend)
└── ConfigMap: sim-defaults        (frozen %, N, algotype mix ratios)
```

---

## Build order

1. **Enrich `StatusProbe` snapshots** — minimal change to existing code; establishes
   the data contract everything else depends on
2. **FastAPI wrapper** around `multithread_cell_sorting_steps.py` — accepts config
   POST, runs experiment, writes steps to Redis Stream
3. **Browser player** — React + Canvas with the step array pre-loaded; add live
   WebSocket streaming after basic playback works
4. **Kubernetes manifests** — straightforward once the above two work locally via
   Docker Compose

---

## Known risks

- **Step volume**: `multithread_cell_sorting_steps.py` runs 50 experiments × potentially
  thousands of steps each. Bulk JSON fetch may need pagination or step-sampling for the
  metrics charts; Redis Streams handle the write volume fine.
- **Chimeric concurrency**: mixed-Algotype experiments produce non-deterministic swap
  ordering across threads. The snapshot must capture thread ID or cell identity, not
  just position, to replay faithfully.
