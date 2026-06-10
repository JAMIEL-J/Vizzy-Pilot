import pytest

def test_confirm_mapping_persists_immutably(client, approved_version_id):
    dataset_id = approved_version_id["dataset_id"]
    version_id = approved_version_id["version_id"]
    r = client.get(f"/api/v1/datasets/{dataset_id}/versions/{version_id}")
    assert r.status_code == 200
    version = r.json()
    assert version["semantic_map_json"] is not None
    # The map is stored as a JSON string of {role: column}
    import json
    mapping = json.loads(version["semantic_map_json"])
    assert len(mapping) == 7

def test_confirm_mapping_rejects_unclassified(client, sample_csv):
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
    
    import time
    status = None
    for _ in range(30):
        status_resp = client.get(f"/api/v1/datasets/{dataset_id}/status")
        status = status_resp.json()
        if status["status"] == "ready": break
        time.sleep(1)
    
    version_id = status["version_id"]
    # submit mapping with one column still unclassified
    bad_mapping = {
        "order_date": "unclassified",
        "revenue": "revenue",
    }
    r = client.post(f"/api/v1/datasets/{dataset_id}/versions/{version_id}/confirm-mapping",
                        json={"mappings": bad_mapping})
    # Should reject mappings with unclassified roles
    assert r.status_code == 422



def test_remap_creates_new_version(client, approved_version_id):
    dataset_id = approved_version_id["dataset_id"]
    version_id = approved_version_id["version_id"]

    new_mapping = {
        "order_date": "date",
        "category": "category",
        "revenue": "revenue",
        "cost": "cost",
        "quantity": "quantity",
        "customer_id": "primary_key",
        "is_returned": "boolean_flag",
    }
    r = client.post(f"/api/v1/datasets/{dataset_id}/versions/{version_id}/remap/confirm",
                    json={"mappings": new_mapping})
    assert r.status_code == 200
    new_version = r.json()
    assert new_version["id"] != version_id
    assert new_version["parent_version_id"] == version_id

def test_remap_preview_returns_affected_charts(client, approved_version_id):
    dataset_id = approved_version_id["dataset_id"]
    version_id = approved_version_id["version_id"]

    # change revenue role -> should affect charts using revenue as y_col
    changed = {"revenue": "cost"}
    r = client.post(f"/api/v1/datasets/{dataset_id}/versions/{version_id}/remap",
                    json={"mappings": changed})
    assert r.status_code == 200
    body = r.json()
    assert "affected_charts" in body
    assert "manually_customized_charts" in body
    for chart in body["affected_charts"]:
        assert chart["impact"] in ("x_axis_changes", "y_axis_changes", "groupby_changes")

def test_original_version_semantic_map_unchanged_after_remap(client, approved_version_id):
    dataset_id = approved_version_id["dataset_id"]
    version_id = approved_version_id["version_id"]

    original = client.get(f"/api/v1/datasets/{dataset_id}/versions/{version_id}").json()
    original_map = original["semantic_map_json"]
    
    new_mapping = {
        "order_date": "date",
        "category": "category",
        "revenue": "cost",
        "cost": "revenue",
        "quantity": "quantity",
        "customer_id": "primary_key",
        "is_returned": "boolean_flag"
    }
    client.post(f"/api/v1/datasets/{dataset_id}/versions/{version_id}/remap/confirm",
                json={"mappings": new_mapping})
    
    # re-fetch original - must be unchanged
    refetched = client.get(f"/api/v1/datasets/{dataset_id}/versions/{version_id}").json()
    assert refetched["semantic_map_json"] == original_map
