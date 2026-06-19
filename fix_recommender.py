import re

file_path = "backend/app/services/analytics/chart_recommender/recommender.py"
with open(file_path, "r") as f:
    content = f.read()

# Replace column_profiles if block in _generate_all_columns_charts
# Currently it says `if column_profiles and d in column_profiles:`
# but _generate_all_columns_charts doesn't get column_profiles passed in.
# We should change it to just `if False:` or `column_profiles = {}` at the top of the function.

new_content = content.replace("def _generate_all_columns_charts(\n    df: pd.DataFrame,\n    classification: ColumnClassification,\n    curated_titles: Optional[Set[str]] = None,\n    curated_pairs: Optional[Set[Tuple[str, str]]] = None,\n) -> List[ChartRecommendation]:", "def _generate_all_columns_charts(\n    df: pd.DataFrame,\n    classification: ColumnClassification,\n    curated_titles: Optional[Set[str]] = None,\n    curated_pairs: Optional[Set[Tuple[str, str]]] = None,\n    column_profiles: Optional[Dict[str, Any]] = None,\n) -> List[ChartRecommendation]:")

with open(file_path, "w") as f:
    f.write(new_content)
