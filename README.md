# Chimeric Sorting Visualiser

A real-time, browser-based visualiser for the chimeric cell-sorting algorithms
described in Zhang, Goldstein & Levin (2024). Watch emergence happen, step by step.

---

## Background

### The Paper

**[Classical Sorting Algorithms as a Model of Morphogenesis: self-sorting arrays reveal unexpected competencies in a minimal model of basal intelligence](https://arxiv.org/abs/2401.05375)**
*Taining Zhang, Adam Goldstein, Michael Levin — arXiv 2401.05375*

The paper reimagines classical sorting algorithms (bubble, insertion, selection) not
as top-down procedures but as decentralised systems of autonomous agents. Each element
in the array acts independently according to a local sorting policy. The key findings:

- **Error resilience** — decentralised arrays sort more reliably than traditional
  implementations when some elements malfunction or are frozen.
- **Delayed gratification** — systems can temporarily worsen their sortedness in order
  to navigate around a defect and recover later.
- **Chimeric emergence** — when arrays mix elements running *different* algorithms,
  same-type elements spontaneously cluster into contiguous runs. Nobody told them to.

### Michael Levin

[Michael Levin](https://www.drmichaellevin.org/) is a biologist and cognitive scientist
at Tufts University (Allen Discovery Center) and Harvard's Wyss Institute. His lab
studies how intelligence emerges at every scale — from the bioelectric signals that
guide a growing embryo to the collective cognition of cell assemblies to hybrid
biological–computational systems. The unifying thread is *diverse intelligence*: the
idea that problem-solving, memory, and goal-directedness are not exclusive to brains
but arise in far simpler substrates.

The sorting-algorithm paper sits squarely in that programme: even a humble bubble-sort
cell, given autonomy and a local rule, turns out to exhibit rudimentary competencies —
navigation, robustness, and (in a chimeric array) self-organisation — that we don't
usually associate with an `if a[i] > a[i+1]: swap()`.

### Why I Built This

I wanted to *see* the clustering phenomenon. Reading about chimeric emergence is one
thing; watching a mixed array of bubble, insertion, and selection cells gradually
segregate into colour-coded bands — in real time, step by step, with full scrub
control — is another. This visualiser makes that possible without a display server,
matplotlib windows, or static GIFs.

### A Note on How It Was Built

This project was coded agentically in collaboration with
[Claude Code](https://claude.ai/code) as a demonstration of AI-assisted software
development. The full stack — simulation layer, Redis streaming, FastAPI gateway,
React + Canvas frontend, and Docker/Kubernetes infrastructure — was implemented
through an iterative back-and-forth with the agent: describing intent, reviewing
output, catching bugs, and refining behaviour across a single session. The science
and the curiosity behind it are mine; the implementation was a genuine collaboration.

---

## Architecture

```
Python simulation  →  Redis Streams  →  FastAPI WebSocket  →  React + Canvas
(cell threads)                           (per-step JSON)       (browser render)
```

- **Simulation** (`cell_research/`) — the original multi-threaded cell library,
  extended to emit a rich per-swap snapshot: position, algotype, frozen status, and
  three metrics (sortedness, monotonicity error, aggregation).
- **API** (`api/`) — FastAPI service. `POST /experiments` launches a chimeric run in a
  thread pool; `WS /experiments/{id}/live` streams every step to the browser as it is
  produced; `GET /experiments/{id}/steps` returns the full history for scrubbing.
- **Frontend** (`frontend/`) — React + Canvas renderer. Cell hue encodes algotype
  (blue = bubble, green = insertion, orange = selection); brightness encodes value.
  D3 line charts show sortedness (with descent segments in red for delayed
  gratification), monotonicity error, and aggregation over time.
- **Infrastructure** (`k8s/`, `docker-compose.yml`) — local Docker Compose stack for
  development; Kubernetes manifests for production deployment.

---

## Quick Start

```bash
# clone with the cell_research submodule
git clone --recurse-submodules <repo-url>
cd sorting_algos

# start everything
docker compose up
```

Then open **http://localhost:5173**.

Configure N (array size), algotype ratios, and frozen-cell percentage, then click
**Run Experiment**. Steps stream into the browser live. Use the scrub bar and
step-back / step-forward buttons to inspect any moment in the sort. The metrics
panel tracks sortedness, monotonicity error, and aggregation across all steps.

Experiments that exceed **10,000 steps** are automatically aborted; the last
recorded state remains visible.

---

## Project Structure

```
.
├── cell_research/          # git submodule — simulation library
│   ├── modules/multithread/
│   │   ├── MultiThreadCell.py   # take_snapshot() → enriched JSON per swap
│   │   ├── StatusProbe.py
│   │   ├── BubbleSortCell.py
│   │   ├── SelectionSortCell.py
│   │   └── InsertionSortCell.py
│   └── pyproject.toml
├── api/
│   ├── main.py             # FastAPI endpoints + WebSocket stream
│   ├── simulation.py       # chimeric experiment runner + StreamingStatusProbe
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   └── src/
│       ├── App.tsx
│       ├── api.ts
│       ├── types.ts
│       └── components/
│           ├── ArrayView.tsx    # Canvas cell renderer
│           ├── MetricsPanel.tsx # D3 line charts
│           └── Controls.tsx     # playback controls
├── k8s/                    # Kubernetes manifests
├── docker-compose.yml
└── ARCHITECTURE.md
```

---

## Visual Encoding

| Property | Encodes |
|---|---|
| Cell hue | Algotype (blue = bubble, green = insertion, orange = selection) |
| Cell brightness | Value (brighter = larger) |
| Grey hatching | Frozen cell |
| Red line segments | Sortedness *decrease* (delayed gratification) |
| Green `● live` badge | Experiment streaming in real time |
