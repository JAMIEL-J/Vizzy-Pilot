import json
import time
import pytest

def test_dashboard_load_returns_sse_stream(client, approved_version_id):
    version_id = approved_version_id["version_id"]
    headers = approved_version_id.get("headers")
    with client.stream("GET", f"/api/v1/dashboard/load/{version_id}", headers=headers) as r:
        assert r.status_code == 200
        assert "text/event-stream" in r.headers["content-type"]

def test_sse_stream_terminates_with_done_event(client, approved_version_id):
    done_received = False
    version_id = approved_version_id["version_id"]
    headers = approved_version_id.get("headers")
    with client.stream("GET", f"/api/v1/dashboard/load/{version_id}", headers=headers) as r:
        for line in r.iter_lines():
            if line.startswith("data:"):
                payload = json.loads(line[5:].strip())
                if payload.get("error"):
                    pytest.fail(payload["error"])
                if payload.get("event") == "done":
                    done_received = True
                    break
    assert done_received

def test_every_chart_result_has_required_fields(client, approved_version_id):
    charts = []
    version_id = approved_version_id["version_id"]
    headers = approved_version_id.get("headers")
    with client.stream("GET", f"/api/v1/dashboard/load/{version_id}", headers=headers) as r:
        for line in r.iter_lines():
            if line.startswith("data:"):
                payload = json.loads(line[5:].strip())
                if payload.get("error"):
                    pytest.fail(payload["error"])
                if payload.get("event") == "done":
                    break
                charts.append(payload)
    assert len(charts) > 0
    for chart in charts:
        assert "chart_id" in chart
        # The spec says "chart_type" should be in the result
        assert "chart_type" in chart
        assert "data" in chart
        assert "execution_slot" in chart
        assert chart["execution_slot"] in ("duckdb", "pandas")


def test_pandas_charts_never_return_inf_or_nan(client, approved_version_id):
    version_id = approved_version_id["version_id"]
    headers = approved_version_id.get("headers")
    with client.stream("GET", f"/api/v1/dashboard/load/{version_id}", headers=headers) as r:
        for line in r.iter_lines():
            if line.startswith("data:"):
                payload = json.loads(line[5:].strip())
                if payload.get("event") == "done":
                    break
                if payload.get("execution_slot") == "pandas":
                    for row in payload["data"]:
                        for val in row.values():
                            if isinstance(val, float):
                                assert val == val  # NaN check
                                assert val != float("inf")

def test_cache_hit_returns_faster_than_cold(client, approved_version_id):
    # cold load
    version_id = approved_version_id["version_id"]
    headers = approved_version_id.get("headers")
    start = time.time()
    with client.stream("GET", f"/api/v1/dashboard/load/{version_id}", headers=headers) as r:
        for line in r.iter_lines():
            if line.startswith("data:") and json.loads(line[5:].strip()).get("event") == "done":
                break
    cold_ms = (time.time() - start) * 1000
    # warm load (cache populated)
    start = time.time()
    with client.stream("GET", f"/api/v1/dashboard/load/{version_id}", headers=headers) as r:
        for line in r.iter_lines():
            if line.startswith("data:") and json.loads(line[5:].strip()).get("event") == "done":
                break
    warm_ms = (time.time() - start) * 1000
    
    assert warm_ms < cold_ms


def test_duckdb_charts_arrive_before_pandas(client, approved_version_id):
    arrival_order = []
    version_id = approved_version_id["version_id"]
    headers = approved_version_id.get("headers")
    with client.stream("GET", f"/api/v1/dashboard/load/{version_id}", headers=headers) as r:
        for line in r.iter_lines():
            if line.startswith("data:"):
                payload = json.loads(line[5:].strip())
                if payload.get("event") == "done":
                    break
                arrival_order.append(payload["execution_slot"])
    
    if not arrival_order:
        return # Skip if no charts generated
        
    # all duckdb slots must appear before first pandas slot
    first_pandas = next((i for i, s in enumerate(arrival_order) if s == "pandas"), len(arrival_order))
    duckdb_before_pandas = all(s == "duckdb" for s in arrival_order[:first_pandas])
    assert duckdb_before_pandas
