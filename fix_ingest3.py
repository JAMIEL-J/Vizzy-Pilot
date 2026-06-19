import re

file_path = "backend/app/services/ingestion_service.py"
with open(file_path, "r") as f:
    content = f.read()

# Just restore ingestion_service.py completely via git and re-apply cleanly
