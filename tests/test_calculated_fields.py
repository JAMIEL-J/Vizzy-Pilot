import pytest
import time
import uuid
from app.core.security import create_access_token
from app.models.user import UserRole

# Define 20 natural language prompts mapping exactly to the test dataset schema columns:
# 'order_date', 'category', 'revenue', 'cost', 'quantity', 'customer_id', 'is_returned'
CALCULATED_FIELD_PROMPTS = [
    # --- EASY (Basic arithmetic & column mappings) ---
    {"id": 1, "prompt": "create a gross margin calculated field using revenue and cost"},
    {"id": 2, "prompt": "revenue minus cost"},
    {"id": 3, "prompt": "Double the revenue"},
    {"id": 4, "prompt": "revenue tax of 5 percent"},
    {"id": 5, "prompt": "Discount of 10 percent on revenue"},
    {"id": 6, "prompt": "Is category equal to Technology"},
    {"id": 7, "prompt": "Total quantity count"},
    
    # --- MEDIUM (Aggregate division, protections & conditionals) ---
    {"id": 8, "prompt": "profit margin percentage using revenue and cost"},
    {"id": 9, "prompt": "revenue divided by quantity"},
    {"id": 10, "prompt": "average cost per unit using cost and quantity"},
    {"id": 11, "prompt": "total revenue divided by total quantity"},
    {"id": 12, "prompt": "High Value transaction segment when revenue is greater than 1000"},
    {"id": 13, "prompt": "Extract Year of order_date using EXTRACT(YEAR FROM CAST(order_date AS DATE))"},
    {"id": 14, "prompt": "Is weekend order_date check using DOW (day of week) extraction on order_date"},

    # --- COMPLEX (Date differences, coalesce, advanced case conditions) ---
    {"id": 15, "prompt": "Days between order_date and date '2024-01-01' using DATE_DIFF"},
    {"id": 16, "prompt": "Customer lifetime value tier based on revenue levels"},
    {"id": 17, "prompt": "Cost target achievement rate using cost"},
    {"id": 18, "prompt": "Coalesced Cost Estimate fallback using cost and revenue"},
    {"id": 19, "prompt": "Revenue Target Achievement Rate using revenue"},
    {"id": 20, "prompt": "Extract Month number of order_date using EXTRACT(MONTH FROM CAST(order_date AS DATE))"}
]

@pytest.fixture
def auth_headers():
    """Generate a valid mock JWT access token header for testing."""
    token = create_access_token(user_id=str(uuid.uuid4()), role=UserRole.USER)
    return {"Authorization": f"Bearer {token}"}

@pytest.fixture
def ready_dataset_info(client, sample_csv, auth_headers):
    """Correctly setup, upload, and confirm mapping for a test dataset with authorization headers."""
    unique_name = f"Test Dataset {uuid.uuid4().hex[:8]}"
    
    # 1. Create dataset
    ds_resp = client.post(
        "/api/v1/datasets", 
        json={"name": unique_name, "description": "Test calculated fields"},
        headers=auth_headers
    )
    assert ds_resp.status_code == 201, f"Failed to create dataset: {ds_resp.text}"
    dataset_id = ds_resp.json()["id"]

    # 2. Upload CSV
    with open(sample_csv, "rb") as f:
        r = client.post(
            f"/api/v1/datasets/{dataset_id}/upload", 
            files={"file": f},
            headers=auth_headers
        )
    assert r.status_code == 201, f"Upload failed: {r.text}"

    # 3. Poll status until ready
    status = None
    for _ in range(30):
        status_resp = client.get(
            f"/api/v1/datasets/{dataset_id}/status",
            headers=auth_headers
        )
        status = status_resp.json()
        if status["status"] == "ready":
            break
        time.sleep(1)
    
    assert status and status["status"] == "ready", "Dataset did not reach ready status"
    version_id = status["version_id"]

    # 4. Confirm mapping
    mapping = {
        "order_date": "date",
        "category": "category",
        "revenue": "revenue",
        "cost": "cost",
        "quantity": "quantity",
        "customer_id": "primary_key",
        "is_returned": "boolean_flag",
    }
    confirm_resp = client.post(
        f"/api/v1/datasets/{dataset_id}/versions/{version_id}/confirm-mapping",
        json={"mappings": mapping},
        headers=auth_headers
    )
    assert confirm_resp.status_code == 200, f"Confirm mapping failed: {confirm_resp.text}"

    return {"dataset_id": dataset_id, "version_id": version_id}


def test_api_calculated_field_generation(client, ready_dataset_info, auth_headers):
    """
    Test 20 different natural language prompts via API endpoint
    /api/v1/datasets/{dataset_id}/canvas/calculate-field
    to ensure the AI model generates correct SQL expressions that compile successfully.
    """
    dataset_id = ready_dataset_info["dataset_id"]

    print(f"\n[CALCULATED FIELD API TEST] Starting validation on Dataset ID: {dataset_id}")

    for case in CALCULATED_FIELD_PROMPTS:
        prompt = case["prompt"]
        t_start = time.perf_counter()
        
        # Send calculate-field generation request
        response = client.post(
            f"/api/v1/datasets/{dataset_id}/canvas/calculate-field",
            json={"prompt": prompt},
            headers=auth_headers
        )
        
        duration = time.perf_counter() - t_start
        assert response.status_code == 200, (
            f"Failed to generate calculated field for prompt: '{prompt}'. "
            f"Response: {response.text}"
        )
        
        data = response.json()
        assert data["success"] is True
        assert "field_name" in data
        assert "formula_sql" in data
        assert "category" in data
        assert "dtype" in data
        assert "schema" in data

        print(
            f"PASS [CF-{case['id']}]: '{prompt}' -> Title: '{data['field_name']}' | "
            f"Formula: {data['formula_sql']} | Category: {data['category']} | "
            f"Type: {data['dtype']} (Time: {duration:.2f}s)"
        )
