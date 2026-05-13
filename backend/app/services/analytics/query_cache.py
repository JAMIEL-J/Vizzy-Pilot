from typing import Any, Dict, Optional

# Simple in-memory cache for chart results.
# Key: hash(dataset_id + version_id + chart_id + filters_json)
# Value: The result yielded by the execution pipeline.
_cache: Dict[str, Any] = {}

def get_cached(key: str) -> Optional[Any]:
    """Retrieve a result from the analytics cache."""
    return _cache.get(key)

def set_cached(key: str, result: Any) -> None:
    """Store a result in the analytics cache."""
    _cache[key] = result

def clear_cache() -> None:
    """Clear all cached analytics results."""
    _cache.clear()
