import re

file_path = "backend/app/api/analytics_routes.py"
with open(file_path, "r") as f:
    content = f.read()

# Replace the import resolve_semantic_map since it apparently doesn't exist in dataset_version_service
# Wait, let me check if it's imported from somewhere else or if I can just write it.
