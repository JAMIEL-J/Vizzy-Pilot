import re

file_path = "backend/app/services/visualization/dashboard_filters.py"
with open(file_path, "r") as f:
    content = f.read()

# Replace the condition to include string types, as pandas 3 changes how strings are represented
content = content.replace(
    'pd.api.types.is_object_dtype(col) or isinstance(col.dtype, pd.CategoricalDtype):',
    'pd.api.types.is_object_dtype(col) or pd.api.types.is_string_dtype(col) or isinstance(col.dtype, pd.CategoricalDtype):'
)

with open(file_path, "w") as f:
    f.write(content)
