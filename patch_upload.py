import re

file_path = "backend/app/api/upload_routes.py"
with open(file_path, "r") as f:
    content = f.read()

# Replace mentions of dashboard_data handling since we don't return dashboard layout anymore
content = content.replace('logger.info(f"Initial dashboard generated for version {version_id}")', 'logger.info(f"Initial semantic map generated for version {version_id}")')
content = content.replace('logger.warning(f"Failed to generate initial dashboard: {e}")', 'logger.warning(f"Failed to generate initial semantic map: {e}")')

# The response from generate_initial_dashboard returns {"dashboard": None, "semantic_map": ...}
# Let's keep it assigning `dashboard_data` but we don't care about `dashboard_data.get("dashboard")` because it will be None.
# No code changes strictly required since frontend will handle dashboard: null if it checks it, but frontend was storing dashboard locally.

with open(file_path, "w") as f:
    f.write(content)
