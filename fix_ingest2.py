import re

file_path = "backend/app/services/ingestion_service.py"
with open(file_path, "r") as f:
    content = f.read()

# We need to completely remove the second broken signature of generate_initial_dashboard
# that starts around line 398.

# Let's find the proper generate_initial_dashboard we made:
# It starts with `async def generate_initial_dashboard(` and ends with `return {\n        "dashboard": None,\n        "semantic_map": semantic_map_json,\n    }`

idx1 = content.find("async def generate_initial_dashboard")
idx2 = content.find("async def generate_initial_dashboard", idx1 + 1)

if idx2 != -1:
    content = content[:idx2]

with open(file_path, "w") as f:
    f.write(content)
