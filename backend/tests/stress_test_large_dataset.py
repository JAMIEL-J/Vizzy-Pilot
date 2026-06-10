import pandas as pd
import numpy as np
import time
import os
import uuid
import asyncio
from pathlib import Path
from sqlmodel import Session, create_engine
from unittest.mock import AsyncMock, patch
from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion, SourceType
from app.services import dataset_version_service
from app.services.visualization.dashboard_generator import generate_overview_dashboard
from app.services.analytics.semantic_mapper import SemanticMapper
from app.core.config import get_settings
from app.models.database import init_db

async def run_stress_test():
    print("Starting Stress Test: 250,000 Rows")
    
    # 1. Setup Environment
    settings = get_settings()
    engine = create_engine(settings.database.url)
    init_db()
    
    # Ensure data dir exists
    data_dir = Path("backend/data")
    data_dir.mkdir(parents=True, exist_ok=True)
    csv_path = data_dir / "stress_test_250k.csv"
    
    # 2. Generate Large Dataset
    print(f"Generating {250000} rows of dummy data...")
    n = 250000
    df = pd.DataFrame({
        "C_01": pd.to_datetime(np.random.choice(pd.date_range('2020-01-01', '2023-12-31'), n)),
        "C_02": np.random.uniform(10.0, 5000.0, n),
        "C_03": np.random.choice(['North', 'South', 'East', 'West', 'Central'], n),
        "C_04": [f"ID_{i}" for i in range(n)],
        "C_05": np.random.choice([0, 1], n)
    })
    df.to_csv(csv_path, index=False)
    print(f"File created at {csv_path}")

    # 3. Setup Database (Clean start)
    print("Setting up test database...")
    
    user_id = uuid.uuid4()
    dataset_id = uuid.uuid4()

    with Session(engine) as session:
        # Create Dataset
        dataset = Dataset(id=dataset_id, name="Stress Test Dataset", owner_id=user_id, is_active=True)
        session.add(dataset)
        session.commit()
        
        # Create Version
        version = dataset_version_service.create_dataset_version(
            session=session,
            dataset_id=dataset_id,
            source_type=SourceType.UPLOAD,
            source_reference=str(csv_path.absolute()),
            schema_hash="stress_test_hash",
            created_by=user_id,
            role="ADMIN",
            row_count=n
        )
        session.commit()

        # 4. Benchmark the Pipeline
        print("Benchmarking the Pipeline (This may take a moment)...")
        start_time = time.time()
        
        try:
            # 5. Mocking the LLM to test the pipeline WITHOUT needing real API keys
            with patch.object(SemanticMapper, 'propose_mapping', new_callable=AsyncMock) as mock_map:
                mock_map.return_value = {
                    "mappings": {
                        "C_01": "date",
                        "C_02": "revenue",
                        "C_03": "category",
                        "C_04": "identifier",
                        "C_05": "target"
                    },
                    "metadata": {"proposals": []}
                }

                # The call we are testing
                proposal = await dataset_version_service.propose_semantic_mapping(session, version.id)
            
            end_time = time.time()
            duration = end_time - start_time
            
            print("\n" + "="*40)
            print("STRESS TEST RESULTS")
            print("="*40)
            print(f"Rows Processed: {n:,}")
            print(f"Time Taken:     {duration:.2f} seconds")
            print(f"Avg per 1k:     {(duration/n)*1000:.4f} seconds")
            print("="*40)
            
            # Check if it actually proposed something
            mappings = proposal.get("proposal", {}).get("mappings", {})
            print(f"Mappings Found: {len(mappings)}")
            for col, role in mappings.items():
                print(f"  - {col} -> {role}")
            
            if duration < 5:
                print("\nSUCCESS: Performance is excellent (Mocked LLM).")
            elif duration < 15:
                print("\nWARNING: Performance is acceptable but slow.")
            else:
                print("\nFAILURE: Performance is too slow for production use.")

        except Exception as e:
            print(f"\nTEST FAILED with Error: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(run_stress_test())

