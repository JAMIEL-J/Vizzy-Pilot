import time
import pytest

def test_upload_returns_within_2s(client, sample_csv):
    # Use a unique name for each test to avoid 409 Conflict
    import uuid
    unique_name = f"Test Dataset {uuid.uuid4().hex[:8]}"
    
    # First, create a dataset to get a dataset_id
    ds_resp = client.post("/api/v1/datasets", json={"name": unique_name, "description": "Test"})
    if ds_resp.status_code != 201:
        pytest.fail(f"Failed to create dataset: {ds_resp.status_code} - {ds_resp.text}")
    dataset_id = ds_resp.json()["id"]

    start = time.time()
    with open(sample_csv, "rb") as f:
        r = client.post(f"/api/v1/datasets/{dataset_id}/upload", files={"file": f})
    elapsed = time.time() - start
    assert r.status_code == 201
    assert elapsed < 2.0

def test_upload_response_shape(client, sample_csv):
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
    body = r.json()
    assert "dataset_id" in body
    # The upload response contains the result of ingest_file_upload, 
    # which includes version_id and schema, but the 'status' is handled by the polling endpoint.
    # We check for version_id as a proxy for successful ingestion start.
    assert "version_id" in body


def test_status_polling_transitions_to_ready(client, sample_csv):
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
        if status["status"] == "ready":
            break
        time.sleep(1)
    
    assert status is not None
    assert status["status"] == "ready"
    assert "version_id" in status
    assert "row_count" in status
    assert "schema" in status
    assert status["row_count"] == 1000


def test_status_never_returns_unknown_value(client, sample_csv):
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
    
    for _ in range(30):
        status_resp = client.get(f"/api/v1/datasets/{dataset_id}/status")
        status = status_resp.json()
        assert status["status"] in ("converting", "ready", "error")
        if status["status"] != "converting":
            break
        time.sleep(1)


def test_schema_contains_expected_columns(client, sample_csv):
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
        if status["status"] == "ready":
            break
        time.sleep(1)
    
    cols = [c["name"] for c in status["schema"]]
    assert "order_date" in cols
    assert "revenue" in cols
    assert "category" in cols

