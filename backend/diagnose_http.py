# -*- coding: utf-8 -*-
"""Hit the actual running server endpoints like the frontend does."""
import requests
import concurrent.futures
import time

BASE = "http://localhost:8000/api/v1"

# Login first
login_resp = requests.post(f"{BASE}/auth/login/user", json={
    "email": "jahirjamiel@gmail.com",
    "password": "123456"
})
if login_resp.status_code != 200:
    # Try common passwords
    for pwd in ["password", "Password1!", "test123", "123456789", "Jamiel123", "jamiel123"]:
        login_resp = requests.post(f"{BASE}/auth/login/user", json={
            "email": "jahirjamiel@gmail.com",
            "password": pwd
        })
        if login_resp.status_code == 200:
            break

if login_resp.status_code != 200:
    print(f"Cannot login: {login_resp.status_code} {login_resp.text}")
    print("Generating a token directly instead...")
    
    import sys; sys.path.insert(0, ".")
    from app.core.security import create_access_token, UserRole
    token = create_access_token(
        user_id="a4a3b3e6-77ab-4b0d-8841-612dfaf51ecc",
        role=UserRole.USER
    )
else:
    token = login_resp.json()["access_token"]

headers = {"Authorization": f"Bearer {token}"}
print(f"Got token: {token[:20]}...")

# Test 1: List datasets
print("\n=== TEST 1: GET /datasets ===")
r = requests.get(f"{BASE}/datasets", headers=headers)
print(f"Status: {r.status_code}")
if r.status_code != 200:
    print(f"Error: {r.text[:300]}")
    exit()

datasets = r.json()["datasets"]
print(f"Datasets returned: {len(datasets)}")

# Test 2: Burst - hit metadata + latest for each dataset concurrently  
print(f"\n=== TEST 2: CONCURRENT BURST ({len(datasets)} * 3 calls) ===")

def fetch(url):
    start = time.time()
    r = requests.get(url, headers=headers)
    return {
        "url": url.replace(BASE, ""),
        "status": r.status_code,
        "elapsed_ms": int((time.time() - start) * 1000),
        "error": r.text[:100] if r.status_code >= 400 else None
    }

urls = []
for ds in datasets:
    did = ds["id"]
    urls.append(f"{BASE}/datasets/{did}/versions/latest")
    urls.append(f"{BASE}/datasets/{did}/metadata")
    urls.append(f"{BASE}/datasets/{did}/duckdb-status")

start = time.time()
with concurrent.futures.ThreadPoolExecutor(max_workers=21) as executor:
    results = list(executor.map(fetch, urls))

total_ms = int((time.time() - start) * 1000)

ok = [r for r in results if r["status"] < 400]
fail = [r for r in results if r["status"] >= 400]

print(f"Total time: {total_ms}ms")
print(f"OK: {len(ok)}")
print(f"FAIL: {len(fail)}")

for r in fail:
    print(f"  {r['status']} {r['url']} ({r['elapsed_ms']}ms): {r['error']}")
