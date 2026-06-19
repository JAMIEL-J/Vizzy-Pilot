import re

file_path = "backend/app/services/ingestion_service.py"
with open(file_path, "r") as f:
    content = f.read()

# We need to fix the syntax error on line 409
# Let's read lines 400-415 and print them
lines = content.split('\n')
for i, line in enumerate(lines[390:420], 391):
    print(f"{i}: {line}")
