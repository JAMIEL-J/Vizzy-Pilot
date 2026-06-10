import asyncio
import json
import pandas as pd
import sys
import os
import logging

# Fix pathing to allow importing 'app'
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.services.analytics.data_profiler import DataProfiler
from app.services.analytics.semantic_mapper import SemanticMapper

# Force logging to stdout
logging.basicConfig(level=logging.INFO, stream=sys.stdout)
logger = logging.getLogger("debug_semantic")

async def run_test():
    # Create a dataframe that mimics the 'text' column issue
    # A column named 'text' with categorical values (Low, Medium, High)
    df = pd.DataFrame({
        "C_01": pd.to_datetime(["2023-01-01", "2023-01-02", "2023-01-03"] * 10),
        "C_02": [120.50, 450.00, 300.25] * 10,
        "text": ["Low", "Medium", "High", "Low", "High", "Medium"] * 5
    })

    print("\n--- [STEP 1] Profiling Data ---")
    profiler = DataProfiler()
    profiles = profiler.profile_dataframe(df)
    for col, prof in profiles.items():
        print(f"Column: {col} | Type: {prof.dtype} | Categorical: {prof.is_categorical} | Samples: {prof.samples}")

    print("\n--- [STEP 2] Calling SemanticMapper ---")
    mapper = SemanticMapper()

    # We want to see the RAW response, so we'll monkeypatch the router to print it
    # because we can't easily see the internal logger in some shell environments
    original_generate = mapper.router.generate_response
    async def wrapped_generate(*args, **kwargs):
        res = await original_generate(*args, **kwargs)
        print(f"\n>>> RAW LLM RESPONSE FROM ROUTER: <<<\n{json.dumps(res, indent=2)}")
        return res

    mapper.router.generate_response = wrapped_generate

    result = await mapper.propose_mapping("test-dataset", profiles)

    print("\n--- [STEP 3] FINAL STRUCTURED RESULT ---")
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    asyncio.run(run_test())
