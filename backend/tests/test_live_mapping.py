import asyncio
import os
import json
import pytest
from pathlib import Path
from uuid import uuid4
from dotenv import load_dotenv
from sqlmodel import Session, create_engine

from app.main import app
from fastapi.testclient import TestClient
from app.core.config import get_settings

# Load env from the backend folder
env_path = Path("backend/.env")
load_dotenv(dotenv_path=env_path)

# Setup Test Client with Auth
from app.core.security import create_access_token, UserRole
test_user_id = str(uuid4())
token = create_access_token(user_id=test_user_id, role=UserRole.ADMIN)

client = TestClient(app)
client.headers.update({"Authorization": f"Bearer {token}"})

async def run_live_test():
    print("\n--- Starting Live LLM Mapping Test ---")
    
    # 1. Verify Keys are loaded
    groq_key = os.getenv("LLM_GROQ_API_KEY")
    if not groq_key:
        print("Error: LLM_GROQ_API_KEY not found in .env")
        return
    print("API Keys loaded successfully.")

    # 2. Setup Dataset
    unique_name = f"Live Test {uuid4().hex[:8]}"
    ds_resp = client.post("/api/v1/datasets", json={"name": unique_name, "description": "Live LLM Test"})
    
    if ds_resp.status_code != 201:
        print("Error creating dataset: " + str(ds_resp.status_code) + " - " + ds_resp.text)
        return
        
    dataset_id = ds_resp.json()["id"]
    print("Created dataset: " + str(dataset_id))

    # 3. Upload Sample CSV
    # Using a simple CSV content for testing
    csv_content = "order_date,category,revenue,cost,quantity,customer_id,is_returned\n2024-01-01,Electronics,100,50,1,C1,0\n2024-01-02,Clothing,50,20,2,C2,1"
    csv_path = Path("test_live_mapping.csv")
    csv_path.write_text(csv_content)

    with open(csv_path, "rb") as f:
        r = client.post(f"/api/v1/datasets/{dataset_id}/upload", files={"file": f})
    
    if r.status_code not in (200, 201):
        print("Error uploading file: " + str(r.status_code) + " - " + r.text)
        return
    
    dataset_id = r.json()["dataset_id"]
    print("File uploaded.")

    # 4. Poll for readiness
    import time
    version_id = None
    for _ in range(30):
        status_resp = client.get(f"/api/v1/datasets/{dataset_id}/status")
        status = status_resp.json()
        if status["status"] == "ready":
            version_id = status["version_id"]
            break
        time.sleep(1)
    
    if not version_id:
        print("❌ Error: Dataset never became ready")
        return
    print("Dataset ready. Version: " + str(version_id))

    # 5. Propose Mapping (This hits the LLM)
    print("Calling LLM for semantic mapping...")
    r = client.post(f"/api/v1/datasets/{dataset_id}/versions/{version_id}/propose-mapping")
    
    if r.status_code != 200:
        print(f"❌ API Error: {r.status_code} - {r.text}")
        return

    proposals = r.json().get("proposal", {}).get("metadata", {}).get("proposals", [])
    print(f"Received {len(proposals)} proposals.")

    # 6. Verify LLM actually worked (Confidence > 0)
    classified_count = sum(1 for p in proposals if p.get("confidence", 0) > 0)
    
    if classified_count > 0:
        print("SUCCESS: LLM classified " + str(classified_count) + "/" + str(len(proposals)) + " columns!")
        for p in proposals[:3]: # Print first 3 for observation
            print("  - " + p['column_name'] + ": " + p['role'] + " (conf: " + str(p['confidence']) + ")")
    else:
        print("FAILURE: All columns are unclassified. LLM fallback was triggered.")

    # Cleanup
    csv_path.unlink()

if __name__ == "__main__":
    asyncio.run(run_live_test())
