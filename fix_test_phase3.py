import re

file_path = "backend/tests/test_phase3.py"
with open(file_path, "r") as f:
    content = f.read()

# Remove the dashboard_generator mock entirely and update test assertions since we removed dashboard generation during upload.

content = content.replace("patch('app.services.visualization.dashboard_generator.generate_overview_dashboard_duckdb') as mock_dashboard, \\", "")
content = content.replace("mock_dashboard.return_value = {", "")
content = content.replace("                \"dashboard\": {\"widgets\": [{\"type\": \"kpi\"}]},", "")
content = content.replace("                \"domain\": \"sales\",", "")
content = content.replace("            }", "")
content = content.replace("mock_dashboard.assert_called_once()", "")
content = content.replace("assert \"dashboard\" in result", "assert result[\"dashboard\"] is None")
content = content.replace("assert \"widgets\" in result[\"dashboard\"]", "")

with open(file_path, "w") as f:
    f.write(content)
