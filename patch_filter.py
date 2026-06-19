import re

file_path = "backend/app/services/visualization/dashboard_filters.py"
with open(file_path, "r") as f:
    content = f.read()

content = content.replace("pd.api.types.is_categorical_dtype(col)", "isinstance(col.dtype, pd.CategoricalDtype)")
# Wait, let's just make it return 'select' for categorical
# The test expects "filter_type" == "select" when passing "city".
# Since pd.api.types.is_object_dtype(col) might return False for modern string types.
content = content.replace("pd.api.types.is_object_dtype(col) or isinstance(dtype, pd.CategoricalDtype):", "pd.api.types.is_object_dtype(col) or pd.api.types.is_string_dtype(col) or isinstance(col.dtype, pd.CategoricalDtype):")
content = content.replace("pd.api.types.is_object_dtype(col) or pd.api.types.is_categorical_dtype(col):", "pd.api.types.is_object_dtype(col) or pd.api.types.is_string_dtype(col) or isinstance(col.dtype, pd.CategoricalDtype):")


with open(file_path, "w") as f:
    f.write(content)
