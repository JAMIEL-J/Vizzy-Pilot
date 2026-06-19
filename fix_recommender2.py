import re

file_path = "backend/app/services/analytics/chart_recommender/recommender.py"
with open(file_path, "r") as f:
    content = f.read()

content = content.replace("all_col_charts = _generate_all_columns_charts(\n            df, classification,\n            curated_titles=curated_chart_titles,\n            curated_pairs=curated_pairs,\n        )", "all_col_charts = _generate_all_columns_charts(\n            df, classification,\n            curated_titles=curated_chart_titles,\n            curated_pairs=curated_pairs,\n            column_profiles=column_profiles,\n        )")

with open(file_path, "w") as f:
    f.write(content)
