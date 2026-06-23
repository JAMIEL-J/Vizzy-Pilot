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




def test_churn_dashboard_arpu_and_ltv_match_subscription_formula():
    df = pd.DataFrame({
        "customerID": ["C1", "C2", "C3", "C4"],
        "tenure": [10, 20, 30, 40],
        "MonthlyCharges": [50.0, 60.0, 70.0, 80.0],
        "TotalCharges": [500.0, 1200.0, 2100.0, 3200.0],
        "Churn": ["Yes", "No", "No", "Yes"],
    })
    classification = ColumnClassification(
        metrics=["tenure", "MonthlyCharges", "TotalCharges"],
        dimensions=["customerID"],
        dates=[],
        targets=["Churn"],
    )

    kpis = generate_kpis(df, DomainType.CHURN, classification)

    arpu = next(kpi for kpi in kpis.values() if kpi["title"] == "ARPU")
    ltv = next(kpi for kpi in kpis.values() if kpi["title"] == "Estimated LTV")

    expected_arpu = df["MonthlyCharges"].mean()
    observed_monthly_churn_rate = 2 / df["tenure"].sum()
    expected_ltv = expected_arpu / observed_monthly_churn_rate

    assert arpu["value"] == round(expected_arpu, 2)
    assert arpu["reason"] == "Average Monthly Charges per customer"
    assert ltv["value"] == round(expected_ltv, 2)
    assert ltv["reason"] == "ARPU / observed monthly churn rate"

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
