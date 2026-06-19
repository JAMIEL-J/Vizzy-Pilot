import re

file_path = "backend/app/services/ingestion_service.py"
with open(file_path, "r") as f:
    content = f.read()

# the file currently has the first function ending at line 399
# and starting at line 402 is `*,` which means the second function def was partially deleted
# Let's remove from line 402 to the end of the file.

lines = content.split('\n')
new_lines = lines[:400]
with open(file_path, "w") as f:
    f.write('\n'.join(new_lines))
