from typing import Any, Dict, List
from app.services.cleaning_execution.base import LineageEvent

class LineageTracker:
    """Tracks cleaning lineage events throughout a pipeline run."""
    def __init__(self) -> None:
        self.events: List[LineageEvent] = []

    def record_event(self, event: LineageEvent) -> None:
        self.events.append(event)

    def get_summary(self) -> Dict[str, Any]:
        total_rows_dropped = sum(e.rows_dropped for e in self.events)
        total_cells_modified = sum(e.cells_modified for e in self.events)
        
        affected_cols = set()
        for e in self.events:
            affected_cols.update(e.columns_affected)

        return {
            "steps_executed": len(self.events),
            "rows_dropped": total_rows_dropped,
            "cells_modified": total_cells_modified,
            "columns_affected": sorted(list(affected_cols)),
            "events": [e.to_dict() for e in self.events],
        }
