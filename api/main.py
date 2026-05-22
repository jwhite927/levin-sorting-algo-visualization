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
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Annotated

import redis.asyncio as aioredis
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
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


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


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
