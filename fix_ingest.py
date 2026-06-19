import re

file_path = "backend/app/services/ingestion_service.py"
with open(file_path, "r") as f:
    content = f.read()

# We need to remove the duplicate `generate_initial_dashboard` we accidentally created/left behind.
# We will just write the content we want using exact matching.

parts = content.split("async def generate_initial_dashboard(")
if len(parts) > 2:
    # keep the first function we injected and drop the second
    rest = parts[2]
    # find where the second function ends. In ingestion_service.py it's the last function
    # So we can just drop it.

    new_content = parts[0] + "async def generate_initial_dashboard(" + parts[1]
    with open(file_path, "w") as f:
        f.write(new_content)
