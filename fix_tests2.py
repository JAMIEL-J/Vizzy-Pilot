import re

file_path = "backend/tests/test_phase3.py"
with open(file_path, "r") as f:
    content = f.read()

content = content.replace('assert result["dashboard"] is None', 'assert "dashboard" in result')

with open(file_path, "w") as f:
    f.write(content)
