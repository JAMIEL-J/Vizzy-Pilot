import time
import pytest

def test_propose_mapping_returns_all_columns(client, sample_csv):
    # Use a unique name for each test to avoid 409 Conflict
    import uuid
    unique_name = f"Test Dataset {uuid.uuid4().hex[:8]}"
    
    # First, create a dataset to get a dataset_id
    ds_resp = client.post("/api/v1/datasets", json={"name": unique_name, "description": "Test"})
    if ds_resp.status_code != 201:
        pytest.fail(f"Failed to create dataset: {ds_resp.status_code} - {ds_resp.text}")
    dataset_id = ds_resp.json()["id"]

    with open(sample_csv, "rb") as f:
        r = client.post(f"/api/v1/datasets/{dataset_id}/upload", files={"file": f})
    dataset_id = r.json()["dataset_id"]
    
    status = None
    for _ in range(30):
        status_resp = client.get(f"/api/v1/datasets/{dataset_id}/status")
        status = status_resp.json()
        if status["status"] == "ready": break
        time.sleep(1)
    
    version_id = status["version_id"]
    r = client.post(f"/api/v1/datasets/{dataset_id}/versions/{version_id}/propose-mapping")
    assert r.status_code == 200
    proposals_resp = r.json()
    proposals = proposals_resp.get("proposal", {}).get("metadata", {}).get("proposals", [])
    assert len(proposals) == 7  # all columns in sample CSV

def test_every_proposal_has_required_fields(client, sample_csv):
    # Use a unique name for each test to avoid 409 Conflict
    import uuid
    unique_name = f"Test Dataset {uuid.uuid4().hex[:8]}"
    
    # First, create a dataset to get a dataset_id
    ds_resp = client.post("/api/v1/datasets", json={"name": unique_name, "description": "Test"})
    if ds_resp.status_code != 201:
        pytest.fail(f"Failed to create dataset: {ds_resp.status_code} - {ds_resp.text}")
    dataset_id = ds_resp.json()["id"]

    with open(sample_csv, "rb") as f:
        r = client.post(f"/api/v1/datasets/{dataset_id}/upload", files={"file": f})
    dataset_id = r.json()["dataset_id"]
    
    status = None
    for _ in range(30):
        status_resp = client.get(f"/api/v1/datasets/{dataset_id}/status")
        status = status_resp.json()
        if status["status"] == "ready": break
        time.sleep(1)
    
    version_id = status["version_id"]
    proposals_resp = client.post(f"/api/v1/datasets/{dataset_id}/versions/{version_id}/propose-mapping").json()
    proposals = proposals_resp.get("proposal", {}).get("metadata", {}).get("proposals", [])
    
    for p in proposals:
        assert "column_name" in p
        assert "role" in p
        assert "confidence" in p
        assert "status" in p
        assert p["status"] in ("auto_accepted", "flagged", "unclassified")

def test_confidence_below_065_forces_unclassified(client, sample_csv):
    # Use a unique name for each test to avoid 409 Conflict
    import uuid
    unique_name = f"Test Dataset {uuid.uuid4().hex[:8]}"
    
    # First, create a dataset to get a dataset_id
    ds_resp = client.post("/api/v1/datasets", json={"name": unique_name, "description": "Test"})
    if ds_resp.status_code != 201:
        pytest.fail(f"Failed to create dataset: {ds_resp.status_code} - {ds_resp.text}")
    dataset_id = ds_resp.json()["id"]

    with open(sample_csv, "rb") as f:
        r = client.post(f"/api/v1/datasets/{dataset_id}/upload", files={"file": f})
    dataset_id = r.json()["dataset_id"]
    
    status = None
    for _ in range(30):
        status_resp = client.get(f"/api/v1/datasets/{dataset_id}/status")
        status = status_resp.json()
        if status["status"] == "ready": break
        time.sleep(1)
    
    version_id = status["version_id"]
    proposals_resp = client.post(f"/api/v1/datasets/{dataset_id}/versions/{version_id}/propose-mapping").json()
    proposals = proposals_resp.get("proposal", {}).get("metadata", {}).get("proposals", [])
        
    for p in proposals:
        if p["confidence"] < 0.65:
            assert p["status"] == "unclassified"
            assert p["role"] == "unclassified"

def test_confidence_above_090_is_auto_accepted(client, sample_csv):
    # Use a unique name for each test to avoid 409 Conflict
    import uuid
    unique_name = f"Test Dataset {uuid.uuid4().hex[:8]}"
    
    # First, create a dataset to get a dataset_id
    ds_resp = client.post("/api/v1/datasets", json={"name": unique_name, "description": "Test"})
    if ds_resp.status_code != 201:
        pytest.fail(f"Failed to create dataset: {ds_resp.status_code} - {ds_resp.text}")
    dataset_id = ds_resp.json()["id"]

    with open(sample_csv, "rb") as f:
        r = client.post(f"/api/v1/datasets/{dataset_id}/upload", files={"file": f})
    dataset_id = r.json()["dataset_id"]
    
    status = None
    for _ in range(30):
        status_resp = client.get(f"/api/v1/datasets/{dataset_id}/status")
        status = status_resp.json()
        if status["status"] == "ready": break
        time.sleep(1)
    
    version_id = status["version_id"]
    proposals_resp = client.post(f"/api/v1/datasets/{dataset_id}/versions/{version_id}/propose-mapping").json()
    proposals = proposals_resp.get("proposal", {}).get("metadata", {}).get("proposals", [])
        
    for p in proposals:
        if p["confidence"] >= 0.90:
            assert p["status"] == "auto_accepted"
