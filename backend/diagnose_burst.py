# -*- coding: utf-8 -*-
"""Simulate the frontend burst: hit metadata + latest endpoints concurrently."""
import sys, os, asyncio, time
sys.path.insert(0, ".")

from sqlmodel import Session, select
from app.models.database import engine
from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion
from app.services.dataset_version_service import get_latest_version

async def simulate_burst():
    """Simulate what the frontend does: N * 2 concurrent DB queries."""
    with Session(engine) as session:
        datasets = session.exec(select(Dataset).where(Dataset.is_active == True)).all()
        dataset_ids = [ds.id for ds in datasets]
    
    print(f"Simulating burst for {len(dataset_ids)} datasets ({len(dataset_ids)*2} concurrent queries)...")
    
    errors = []
    start = time.time()
    
    async def fetch_latest(ds_id):
        try:
            with Session(engine) as s:
                v = get_latest_version(session=s, dataset_id=ds_id)
                return f"OK: {ds_id} -> v{v.version_number}"
        except Exception as e:
            errors.append(str(e))
            return f"FAIL: {ds_id} -> {type(e).__name__}: {e}"
    
    # Fire all at once - simulates frontend Promise.all behavior
    tasks = [fetch_latest(did) for did in dataset_ids] * 3  # x3 to simulate page transitions
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    elapsed = time.time() - start
    ok_count = sum(1 for r in results if isinstance(r, str) and r.startswith("OK"))
    fail_count = sum(1 for r in results if isinstance(r, str) and r.startswith("FAIL"))
    
    print(f"\nResults in {elapsed:.2f}s:")
    print(f"  OK: {ok_count}")
    print(f"  FAIL: {fail_count}")
    
    for r in results:
        if isinstance(r, str) and r.startswith("FAIL"):
            print(f"  {r}")
        elif isinstance(r, Exception):
            print(f"  EXCEPTION: {type(r).__name__}: {r}")

asyncio.run(simulate_burst())
