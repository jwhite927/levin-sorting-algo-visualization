"""FastAPI gateway for the chimeric sorting visualiser.

Endpoints
---------
POST /experiments          – launch a new experiment, returns {id}
GET  /experiments/{id}     – experiment status
GET  /experiments/{id}/steps – bulk JSON of all recorded steps
WS   /experiments/{id}/live  – stream steps as they are produced
"""
import asyncio
import json
import os
import statistics
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Annotated

import redis.asyncio as aioredis
from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from simulation import run_experiment

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379")

app = FastAPI(title="Chimeric Sorting Visualiser")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_redis: aioredis.Redis | None = None
_executor = ThreadPoolExecutor(max_workers=20)


@app.on_event("startup")
async def startup():
    global _redis
    _redis = aioredis.from_url(REDIS_URL, decode_responses=True)


@app.on_event("shutdown")
async def shutdown():
    if _redis:
        await _redis.aclose()


def _get_redis() -> aioredis.Redis:
    assert _redis is not None
    return _redis


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class AlgotypeRatios(BaseModel):
    bubble: float = Field(default=0.34, ge=0, le=1)
    insertion: float = Field(default=0.33, ge=0, le=1)
    selection: float = Field(default=0.33, ge=0, le=1)


class ExperimentConfig(BaseModel):
    n: int = Field(default=20, ge=2, le=200)
    algotype_ratios: AlgotypeRatios = AlgotypeRatios()
    frozen_pct: float = Field(default=0.0, ge=0, le=0.5)
    seed: int | None = None


class ExperimentCreated(BaseModel):
    id: str


class ExperimentStatus(BaseModel):
    id: str
    status: str
    step_count: int


class ExperimentSummaryOut(BaseModel):
    id: str
    status: str
    min_aggregation: float
    max_aggregation: float
    final_aggregation: float
    step_count: int
    timestamp: float


class StepCountStats(BaseModel):
    mean: float
    min: int
    max: int


class StatsResponse(BaseModel):
    n: int
    frozen_pct: float
    total_experiments: int
    completed: int
    aborted: int
    avg_min_aggregation: float
    avg_max_aggregation: float
    step_count: StepCountStats
    experiments: list[ExperimentSummaryOut]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.get("/health", include_in_schema=False)
async def health():
    return {"status": "ok"}


@app.post("/experiments", response_model=ExperimentCreated, status_code=201)
async def create_experiment(config: ExperimentConfig):
    exp_id = uuid.uuid4().hex[:8]
    r = _get_redis()
    await r.hset(
        f"experiment:{exp_id}",
        mapping={"status": "running", "config": config.model_dump_json()},
    )
    await r.expire(f"experiment:{exp_id}", 3600)

    config_dict = config.model_dump()
    config_dict["algotype_ratios"] = config.algotype_ratios.model_dump()

    loop = asyncio.get_event_loop()
    loop.run_in_executor(
        _executor, run_experiment, exp_id, config_dict, REDIS_URL
    )
    return {"id": exp_id}


@app.get("/experiments/{exp_id}", response_model=ExperimentStatus)
async def get_experiment(exp_id: str):
    r = _get_redis()
    data = await r.hgetall(f"experiment:{exp_id}")
    if not data:
        raise HTTPException(status_code=404, detail="Experiment not found")
    step_count = await r.xlen(f"experiment:{exp_id}:steps")
    return {"id": exp_id, "status": data.get("status", "unknown"), "step_count": step_count}


@app.get("/experiments/{exp_id}/steps")
async def get_steps(exp_id: str):
    r = _get_redis()
    exists = await r.exists(f"experiment:{exp_id}")
    if not exists:
        raise HTTPException(status_code=404, detail="Experiment not found")
    messages = await r.xrange(f"experiment:{exp_id}:steps")
    return [json.loads(msg[1]["data"]) for msg in messages]


@app.get("/stats", response_model=StatsResponse)
async def get_stats(
    n: int = Query(ge=2, le=200),
    frozen_pct: float = Query(ge=0, le=0.5),
) -> StatsResponse:
    r = _get_redis()
    fp_key = f"{frozen_pct:.2f}"
    stats_key = f"stats:n={n}:fp={fp_key}"

    exp_ids: list[str] = await r.zrange(stats_key, 0, -1)

    raw_summaries: list[tuple[str, dict]] = []
    for exp_id in exp_ids:
        data = await r.hgetall(f"experiment:{exp_id}:summary")
        if data:
            raw_summaries.append((exp_id, data))

    if not raw_summaries:
        return StatsResponse(
            n=n,
            frozen_pct=frozen_pct,
            total_experiments=0,
            completed=0,
            aborted=0,
            avg_min_aggregation=0.0,
            avg_max_aggregation=0.0,
            step_count=StepCountStats(mean=0.0, min=0, max=0),
            experiments=[],
        )

    experiments: list[ExperimentSummaryOut] = [
        ExperimentSummaryOut(
            id=exp_id,
            status=data.get("status", "unknown"),
            min_aggregation=float(data.get("min_aggregation", 0)),
            max_aggregation=float(data.get("max_aggregation", 0)),
            final_aggregation=float(data.get("final_aggregation", 0)),
            step_count=int(data.get("step_count", 0)),
            timestamp=float(data.get("timestamp", 0)),
        )
        for exp_id, data in raw_summaries
    ]
    # Most recent first
    experiments.sort(key=lambda e: e.timestamp, reverse=True)

    min_aggs = [e.min_aggregation for e in experiments]
    max_aggs = [e.max_aggregation for e in experiments]
    step_counts = [e.step_count for e in experiments]

    return StatsResponse(
        n=n,
        frozen_pct=frozen_pct,
        total_experiments=len(experiments),
        completed=sum(1 for e in experiments if e.status == "done"),
        aborted=sum(1 for e in experiments if e.status == "aborted"),
        avg_min_aggregation=statistics.mean(min_aggs),
        avg_max_aggregation=statistics.mean(max_aggs),
        step_count=StepCountStats(
            mean=statistics.mean(step_counts),
            min=min(step_counts),
            max=max(step_counts),
        ),
        experiments=experiments,
    )


@app.websocket("/experiments/{exp_id}/live")
async def live_stream(websocket: WebSocket, exp_id: str):
    r = _get_redis()
    exists = await r.exists(f"experiment:{exp_id}")
    if not exists:
        await websocket.close(code=4004)
        return

    await websocket.accept()
    last_id = "0-0"

    try:
        while True:
            results = await r.xread(
                {f"experiment:{exp_id}:steps": last_id},
                count=50,
                block=500,
            )
            if results:
                for _stream, messages in results:
                    for msg_id, data in messages:
                        await websocket.send_text(data["data"])
                        last_id = msg_id
            else:
                status = await r.hget(f"experiment:{exp_id}", "status")
                if status in ("done", "aborted"):
                    break
    except WebSocketDisconnect:
        return

    # Send a terminal event so the client knows why the stream ended.
    status = await r.hget(f"experiment:{exp_id}", "status")
    step_count = await r.xlen(f"experiment:{exp_id}:steps")
    try:
        await websocket.send_text(
            json.dumps({"event": status, "step_count": step_count})
        )
        await websocket.close()
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Static frontend (production only — ./static is baked in by the Dockerfile)
# ---------------------------------------------------------------------------
_STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")

if os.path.isdir(_STATIC_DIR):
    # Serve hashed asset bundles under /assets/ with long-lived caching
    app.mount("/assets", StaticFiles(directory=os.path.join(_STATIC_DIR, "assets")), name="assets")

    # SPA catch-all: any unmatched GET returns index.html.
    # Defined last so it never shadows the API routes above.
    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_frontend(full_path: str):
        return FileResponse(os.path.join(_STATIC_DIR, "index.html"))
