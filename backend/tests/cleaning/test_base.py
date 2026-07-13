import pytest
import pandas as pd
from datetime import datetime, timezone
from app.services.cleaning_execution.base import CleanOperator, LineageEvent

class DummyOperator(CleanOperator):
    def validate_params(self) -> None:
        if "value" not in self.params:
            raise ValueError("Missing parameter 'value'")

    def execute(self, df: pd.DataFrame) -> pd.DataFrame:
        self.columns_affected = ["col1"]
        self.cells_modified = len(df)
        self.rows_dropped = 0
        return df.copy()

def test_lineage_event():
    timestamp = datetime.now(timezone.utc).isoformat()
    event = LineageEvent(
        operator_name="dummy",
        columns_affected=["col1"],
        rows_dropped=2,
        cells_modified=5,
        timestamp=timestamp,
        details={"reason": "test"}
    )
    assert event.operator_name == "dummy"
    assert event.columns_affected == ["col1"]
    assert event.rows_dropped == 2
    assert event.cells_modified == 5
    assert event.timestamp == timestamp
    assert event.details == {"reason": "test"}
    assert event.to_dict()["operator_name"] == "dummy"

def test_clean_operator_validation():
    with pytest.raises(ValueError, match="Missing parameter 'value'"):
        DummyOperator(params={})

    op = DummyOperator(params={"value": 10})
    assert op.params == {"value": 10}

def test_clean_operator_execute():
    op = DummyOperator(params={"value": 10})
    df = pd.DataFrame({"col1": [1, 2, 3]})
    res = op.execute(df)
    assert len(res) == 3
    metrics = op.get_impact_metrics()
    assert metrics["rows_dropped"] == 0
    assert metrics["cells_modified"] == 3
    assert metrics["columns_affected"] == ["col1"]
