import pytest
import pandas as pd
import json
import os
from uuid import uuid4
from unittest.mock import AsyncMock, patch

from sqlmodel import SQLModel
from sqlmodel import Session, create_engine

from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion, SourceType
from app.services import dataset_version_service
from app.services.visualization.dashboard_generator import generate_overview_dashboard
from app.services.analytics.semantic_mapper import SemanticMapper

# Setup in-memory DB for testing
engine = create_engine("sqlite:///:memory:")

@pytest.fixture
def db_session():
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session

@pytest.fixture
def mock_dataset_file(tmp_path):
    # Create a CSV with obfuscated names
    df = pd.DataFrame({
        "C_01": pd.to_datetime(["2023-01-01", "2023-01-02", "2023-01-03"] * 10),
        "C_02": [100.0, 200.0, 150.0] * 10,
        "C_03": ["North", "South", "East"] * 10
    })
    file_path = tmp_path / "obfuscated_data.csv"
    df.to_csv(file_path, index=False)
    return str(file_path)

@pytest.mark.asyncio
async def test_semantic_pipeline_e2e(db_session, mock_dataset_file):
    """
    E2E Test: Obfuscated Data -> Profiler -> Mapper -> Confirmation -> Dashboard
    """
    user_id = uuid4()
    dataset_id = uuid4()

    # 1. Setup Dataset and Version in DB
    dataset = Dataset(id=dataset_id, name="Obfuscated Test", owner_id=user_id, is_active=True)
    db_session.add(dataset)

    version = dataset_version_service.create_dataset_version(
        session=db_session,
        dataset_id=dataset_id,
        source_type=SourceType.UPLOAD,
        source_reference=mock_dataset_file,
        schema_hash="test_hash",
        created_by=user_id,
        role="ADMIN",
        row_count=30,
        schema_metadata=json.dumps([
            {"name": "C_01", "dtype": "datetime"},
            {"name": "C_02", "dtype": "float64"},
            {"name": "C_03", "dtype": "object"}
        ])
    )
    db_session.commit()

    # 2. Propose Mapping (Mocking the LLM audit)
    # We simulate the LLM discovering that C_02 is revenue, C_01 is date, and C_03 is category
    with patch('app.services.semantic_audit.run_semantic_audit', new_callable=AsyncMock) as mock_audit:
        mock_audit.return_value = [
            {"column": "C_01", "role": "date", "confidence": 0.95, "reasoning": "date column"},
            {"column": "C_02", "role": "revenue", "confidence": 0.95, "reasoning": "revenue column"},
            {"column": "C_03", "role": "category", "confidence": 0.95, "reasoning": "category column"},
        ]

        # Simulate the API call to propose mapping
        proposal = await dataset_version_service.propose_semantic_mapping(db_session, version.id)
        proposals_list = proposal["proposal"]["metadata"]["proposals"]
        c02_proposal = next((p for p in proposals_list if p["column_name"] == "C_02"), None)
        assert c02_proposal is not None
        assert c02_proposal["role"] == "revenue"

    # 3. Confirm Mapping (The Human-in-the-Loop step)
    # New format: {column: role}
    confirmed_map = {
        "C_02": "revenue",
        "C_01": "date",
        "C_03": "category"
    }
    dataset_version_service.confirm_semantic_mapping(
        session=db_session,
        version_id=version.id,
        confirmed_map=confirmed_map
    )

    # Refresh version to see the saved map
    db_session.refresh(version)
    assert version.semantic_map_json is not None
    assert json.loads(version.semantic_map_json)["C_02"] == "revenue"

    # 4. Generate Dashboard using the Semantic Map
    df = pd.read_csv(mock_dataset_file)
    # We pass the confirmed map into the generator
    dashboard = generate_overview_dashboard(
        df=df,
        schema={}, # Simplified for test
        semantic_map_json=version.semantic_map_json
    )

    # 5. VERIFICATION: Check if the dashboard used the semantic roles
    # The dashboard should have a KPI for "Revenue" and a chart for "Revenue"
    widgets = dashboard["dashboard"]["widgets"]

    # Check for a Revenue KPI
    revenue_kpi = next((w for w in widgets if w["type"] == "kpi" and "Revenue" in w["title"]), None)
    assert revenue_kpi is not None, "Dashboard failed to generate a Revenue KPI from obfuscated column C_02"

    # Check for a Revenue Chart
    revenue_chart = next((w for w in widgets if w["type"] in ["bar", "hbar", "line"] and "Revenue" in w["title"]), None)
    assert revenue_chart is not None, "Dashboard failed to generate a Revenue chart from obfuscated column C_02"

    print("\n✅ E2E Semantic Pipeline Verified!")
    print(f"Successfully mapped C_02 -> Revenue and generated dashboard widgets.")
