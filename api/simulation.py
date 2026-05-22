"""Chimeric sorting experiment runner.

Runs in a background thread; publishes each step snapshot to a Redis Stream
as the simulation produces it, enabling live WebSocket streaming.
"""
import json
import random
import threading
import time

import redis as sync_redis

from cell_research import (
    BubbleSortCell,
    CellGroup,
    CellStatus,
    GroupStatus,
    InsertionSortCell,
    SelectionSortCell,
    StatusProbe,
)

CELL_CLASSES = {
    "bubble": BubbleSortCell,
    "insertion": InsertionSortCell,
    "selection": SelectionSortCell,
}

STREAM_MAXLEN = 100_000


class StreamingStatusProbe(StatusProbe):
    """StatusProbe that publishes each enriched step to a Redis Stream."""

    def __init__(self, experiment_id: str, redis_client: sync_redis.Redis):
        super().__init__()
        self.experiment_id = experiment_id
        self.redis_client = redis_client

    def record_sorting_step(self, snapshot: dict):
        super().record_sorting_step(snapshot)
        self.redis_client.xadd(
            f"experiment:{self.experiment_id}:steps",
            {"data": json.dumps(snapshot)},
            maxlen=STREAM_MAXLEN,
            approximate=True,
        )


def _no_cells_should_move(cells: list) -> bool:
    for c in cells:
        if c.status in (CellStatus.ACTIVE, CellStatus.MOVING) and c.should_move():
            return False
    return True


def run_experiment(experiment_id: str, config: dict, redis_url: str) -> None:
    """Run one chimeric sorting experiment and publish steps to Redis.

    Args:
        experiment_id: Redis key prefix, e.g. "abc123".
        config: dict with keys n, algotype_ratios, frozen_pct, seed.
        redis_url: e.g. "redis://redis:6379".
    """
    r = sync_redis.from_url(redis_url, decode_responses=True)

    n: int = config.get("n", 20)
    ratios: dict = config.get("algotype_ratios", {"bubble": 1.0})
    frozen_pct: float = config.get("frozen_pct", 0.0)
    seed = config.get("seed")

    if seed is not None:
        random.seed(seed)

    value_list = list(range(n))
    random.shuffle(value_list)

    # Assign algotypes according to ratios
    algotypes: list[str] = []
    ratio_items = list(ratios.items())
    for _ in range(n):
        roll = random.random()
        cumulative = 0.0
        chosen = ratio_items[0][0]
        for atype, ratio in ratio_items:
            cumulative += ratio
            if roll <= cumulative:
                chosen = atype
                break
        algotypes.append(chosen)

    thread_lock = threading.Lock()
    probe = StreamingStatusProbe(experiment_id, r)
    left_boundary = (0, 1)
    right_boundary = (n - 1, 1)
    cells: list = []

    for i, (value, ctype) in enumerate(zip(value_list, algotypes)):
        CellClass = CELL_CLASSES.get(ctype, BubbleSortCell)
        cell = CellClass(
            i + 1,
            value,
            thread_lock,
            (i, 1),
            cells,
            left_boundary,
            right_boundary,
            probe,
            disable_visualization=True,
        )
        cells.append(cell)

    period = 1_000_000_000
    group = CellGroup(
        cells, cells, 0, left_boundary, right_boundary,
        GroupStatus.ACTIVE, thread_lock, period, period,
    )
    for cell in cells:
        cell.group = group

    # Freeze random cells
    frozen_count = max(0, int(n * frozen_pct))
    if frozen_count:
        for idx in random.sample(range(n), frozen_count):
            cells[idx].set_cell_to_freeze()

    # Activate
    thread_lock.acquire()
    for cell in cells:
        if cell.status != CellStatus.FREEZE:
            cell.start()
    group.start()
    thread_lock.release()

    # Wait for sort to stabilise
    timeout = time.time() + 300  # 5-minute guard
    while not _no_cells_should_move(cells):
        if time.time() > timeout:
            break
        time.sleep(0.05)

    thread_lock.acquire()
    for cell in cells:
        cell.status = CellStatus.INACTIVE
    group.status = GroupStatus.MERGED
    thread_lock.release()

    r.hset(f"experiment:{experiment_id}", "status", "done")
    r.expire(f"experiment:{experiment_id}", 3600)
    r.expire(f"experiment:{experiment_id}:steps", 3600)
