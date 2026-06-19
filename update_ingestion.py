import re

file_path = "backend/app/services/ingestion_service.py"
with open(file_path, "r") as f:
    content = f.read()

# Replace generate_initial_dashboard contents
# Find the start
start_match = re.search(r"async def generate_initial_dashboard\(.*?\)\s*->\s*Dict\[str, Any\]:", content, re.DOTALL)
if start_match:
    start_idx = start_match.end()

    # We want to keep everything until `try:` block
    # We will replace it with a new block

    new_func = '''
async def generate_initial_dashboard(
    *,
    session: Session,
    dataset_id: UUID,
    version_id: UUID,
    user_id: UUID,
    schema: List[Dict[str, Any]],
    raw_path: str,
) -> Dict[str, Any]:
    """
    Generate auto semantic mapping after file upload.

    DuckDB-first approach:
    1. Build DuckDB file synchronously (replaces full-CSV pandas load)
    2. Run semantic audit (reads statistics/samples from DuckDB)

    Raises RuntimeError if DuckDB build fails — caller should return 422.
    """
    from app.services.analytics.duckdb_builder import build_duckdb_from_csv
    from app.services.semantic_audit import run_semantic_audit
    from app.core.llm_client import get_llm_client
    import json

    # ── 1. Build DuckDB synchronously ──
    # This replaces the old safe_read_csv() pandas full-load approach.
    # If the build fails, propagate the error so the upload endpoint
    # can return HTTP 422 with a user-facing message.
    duckdb_path = await build_duckdb_from_csv(
        dataset_id=dataset_id,
        version_id=version_id,
        csv_path=raw_path,
    )

    # ── 2. Run semantic audit ──
    # run_semantic_audit connects to DuckDB directly for column samples and stats.
    llm_client = get_llm_client()
    try:
        mappings = await run_semantic_audit(
            dataset_id=str(dataset_id),
            version_id=str(version_id),
            schema=schema,
            llm_router=llm_client,
        )

        # Convert mappings to semantic_map_json format
        semantic_map = {m["column"]: m["role"] for m in mappings if "column" in m and "role" in m}
        semantic_map_json = json.dumps(semantic_map)

        # Update version with semantic map
        version = session.get(DatasetVersion, version_id)
        if version:
            version.semantic_map_json = semantic_map_json
            session.add(version)
            session.commit()
    except Exception as e:
        # If semantic mapping fails, continue without it
        semantic_map_json = None

    return {
        "dashboard": None,
        "semantic_map": semantic_map_json,
    }
'''

    # We replace the function definition until the end of the file or next def
    pattern = r"async def generate_initial_dashboard\(.*?(?=^def |$)"
    content = re.sub(pattern, new_func.strip() + "\n\n", content, flags=re.DOTALL | re.MULTILINE)

    with open(file_path, "w") as f:
        f.write(content)
