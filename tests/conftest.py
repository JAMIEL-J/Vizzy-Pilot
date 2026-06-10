import pytest
import duckdb
import time
from fastapi.testclient import TestClient
from app.main import app

@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c

@pytest.fixture
def sample_csv(tmp_path):
    # 1000 rows, covers all role types
    csv = tmp_path / "test_dataset.csv"
    content = "order_date,category,revenue,cost,quantity,customer_id,is_returned\n"
    for i in range(1, 1001):
        content += f"2024-0{(i%12)+1}-01,Cat{i%5},{1000+i},{400+i},{i%20},CUST{i},{i%2}\n"
    csv.write_text(content)
    return csv

@pytest.fixture
def approved_version_id(client, sample_csv):
    # Runs full Phase 1–3 and returns a confirmed version_id
    with open(sample_csv, "rb") as f:
        r = client.post("/api/datasets/upload", files={"file": f})
    
    dataset_id = r.json()["dataset_id"]
    
    # poll until ready
    version_id = None
    for _ in range(30):
        status_resp = client.get(f"/api/datasets/{dataset_id}/status")
        status = status_resp.json()
        if status["status"] == "ready":
            version_id = status["version_id"]
            break
        time.sleep(1)
    
    if not version_id:
        pytest.fail("Dataset failed to reach 'ready' status in time")

    # confirm with a synthetic map
    mapping = [
        {"column_name": "order_date", "role": "date", "confidence": 0.95},
        {"column_name": "category", "role": "category", "confidence": 0.95},
        {"column_name": "revenue", "role": "revenue", "confidence": 0.95},
        {"column_name": "cost", "role": "cost", "confidence": 0.95},
        {"column_name": "quantity", "role": "quantity", "confidence": 0.95},
        {"column_name": "customer_id", "role": "primary_key", "confidence": 0.95},
        {"column_name": "is_returned", "role": "boolean_flag", "confidence": 0.95},
    ]
    
    client.post(f"/api/datasets/{version_id}/confirm-mapping",
                json={"mappings": mapping, "approved_by": "test_user"})
    
    return version_id
