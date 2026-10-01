"""Run the agent on many conversations in parallel.

Agent runs are I/O bound (Claude API, MySQL, SMTP), so threads overlap the
waiting time even with the GIL. Each run opens its own DB connections
(db.py connects per query), so threads share no connection state.
"""
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

from . import agent, db

DEFAULT_WORKERS = 4  # keeps us well under Claude API rate limits


def open_thread_ids() -> list[str]:
    return [r["id"] for r in db.query("SELECT id FROM threads WHERE status='open' ORDER BY created_at")]


def run_all(thread_ids=None, mode="llm", workers=DEFAULT_WORKERS, on_event=None, on_done=None) -> dict:
    """Run agent.run on each thread concurrently.

    on_event(thread_id, event) and on_done(thread_id, result) are called from worker
    threads but serialized with a lock, so callers need no locking of their own.
    Returns {"results": {thread_id: result}, "errors": {thread_id: msg}, "seconds": float}.
    """
    ids = list(thread_ids) if thread_ids is not None else open_thread_ids()
    lock = threading.Lock()
    results, errors = {}, {}
    started = time.perf_counter()

    def work(tid):
        def ev(e):
            if on_event:
                with lock:
                    on_event(tid, e)
        return agent.run(thread_id=tid, mode=mode, on_event=ev)

    db.log_action("batch_started", details={"threads": ids, "mode": mode, "workers": workers})
    with ThreadPoolExecutor(max_workers=max(1, min(workers, len(ids) or 1))) as pool:
        futures = {pool.submit(work, tid): tid for tid in ids}
        for fut in as_completed(futures):
            tid = futures[fut]
            try:
                res = fut.result()
                with lock:
                    results[tid] = res
                    if on_done:
                        on_done(tid, res)
            except Exception as e:  # one bad thread must not stop the batch
                with lock:
                    errors[tid] = f"{type(e).__name__}: {e}"

    seconds = round(time.perf_counter() - started, 1)
    summary = {tid: r.get("decision") for tid, r in results.items()}
    db.log_action("batch_finished", details={"decisions": summary, "errors": errors, "seconds": seconds})
    return {"results": results, "errors": errors, "seconds": seconds}
