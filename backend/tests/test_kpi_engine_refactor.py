import pytest
import pandas as pd
from app.services.analytics.kpi_engine import generate_kpis, DomainType, ColumnClassification

def test_kpi_engine_sales_no_reader():
    df = pd.DataFrame({
        "revenue": [100, 200, 300],
        "quantity": [1, 2, 3],
        "profit": [10, 20, 30]
    })
    classification = ColumnClassification(
        metrics=["revenue", "quantity", "profit"],
        dimensions=[],
        dates=[],
        targets=[]
    )
    # This should call _generate_sales_kpis and execute without lambdas
    kpis = generate_kpis(df, DomainType.SALES, classification)

    assert kpis is not None
    # We just want to check if the logic ran fine and returned dict of kpis
    assert len(kpis) > 0

    # Let's inspect the keys
    keys = kpis.keys()
    assert any("kpi" in k for k in keys)

    # Check that revenue is correctly aggregated
    # Total revenue = 600
    revenue_kpi = None
    for key, data in kpis.items():
        if "Income" in data["title"] or "Revenue" in data["title"] or "Amount" in data["title"] or "Total" in data["title"]:
            revenue_kpi = data
            break

    assert revenue_kpi is not None
    assert revenue_kpi["value"] == 600.0

def test_kpi_engine_marketing_no_reader():
    df = pd.DataFrame({
        "impressions": [1000, 2000],
        "clicks": [10, 20],
        "spend": [50, 100]
    })
    classification = ColumnClassification(
        metrics=["impressions", "clicks", "spend"],
        dimensions=[],
        dates=[],
        targets=[]
    )
    kpis = generate_kpis(df, DomainType.MARKETING, classification)
    assert len(kpis) > 0

    imp_kpi = None
    for key, data in kpis.items():
        if "Impressions" in data["title"]:
            imp_kpi = data
            break

    assert imp_kpi is not None
    assert imp_kpi["value"] == 3000.0


class MockDuckDBReader:
    def __init__(self, data):
        self.data = data
        self.df = pd.DataFrame(data)

    def row_count(self):
        return len(self.df)

    def sum_col(self, col):
        return self.df[col].sum()

    def avg_col(self, col):
        return self.df[col].mean()

    @property
    def _conn(self):
        return None

    @property
    def _table(self):
        return None

def test_kpi_engine_finance_with_reader():
    df = pd.DataFrame({
        "revenue": [500, 1000],
        "cost": [200, 300]
    })
    reader = MockDuckDBReader({
        "revenue": [500, 1000, 1500], # Reader has more data
        "cost": [200, 300, 400]
    })

    classification = ColumnClassification(
        metrics=["revenue", "cost"],
        dimensions=[],
        dates=[],
        targets=[]
    )
    kpis = generate_kpis(df, DomainType.FINANCE, classification, reader=reader, total_rows=reader.row_count())

    assert len(kpis) > 0
    rev_kpi = None
    for key, data in kpis.items():
        if "Income" in data["title"] or "Revenue" in data["title"] or "Amount" in data["title"] or "Total" in data["title"]:
            rev_kpi = data
            break

    assert rev_kpi is not None
    # the reader value is 3000, df value is 1500
    assert rev_kpi["value"] == 3000.0
