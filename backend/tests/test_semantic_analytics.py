import pandas as pd
import pytest
from app.services.analytics.semantic_resolver import find_column, get_column_semantic_role, semantic_similarity
from app.services.analytics import kpi_engine, column_filter, chart_recommender
from app.services.analytics.domain_detector import DomainType

def test_semantic_similarity_exact_and_substring():
    assert semantic_similarity("revenue", "Revenue") == 1.0
    assert semantic_similarity("sales", "Total_Sales") >= 0.85
    assert semantic_similarity("amount", "Amount Paid") >= 0.85

def test_semantic_similarity_abbreviations():
    # Abbreviations defined in ABBREVIATION_MAP should boost scores
    assert semantic_similarity("revenue", "Tot_Rev") >= 0.55
    assert semantic_similarity("charges", "MonthlyChgs") >= 0.55
    assert semantic_similarity("tenure", "CustTnr") >= 0.55

def test_find_column_with_semantic_resolver():
    cols = ["Customer_ID", "Tot_Rev", "MonthlyChgs", "CustTnr", "PurchaseDate"]
    assert find_column(["revenue", "sales"], cols) == "Tot_Rev"
    assert find_column(["charges", "cost"], cols) == "MonthlyChgs"
    assert find_column(["tenure", "age"], cols) == "CustTnr"
    assert find_column(["date", "time"], cols) == "PurchaseDate"

def test_column_filter_prioritization():
    # Test that _get_column_priority uses semantic scoring correctly
    
    # "Rev" should get top tier metrics priority (100)
    score_rev = column_filter._get_column_priority("Tot_Rev", DomainType.SALES)
    # "Discount" is usually further down
    score_discount = column_filter._get_column_priority("DiscountAmt", DomainType.SALES)
    
    # Priority should be higher for primary metric
    assert score_rev > 0 
    assert score_discount > 0
    assert score_rev > score_discount

def test_column_filter_product_geo_customer():
    # Create test dataframe
    df = pd.DataFrame({
        "CustCity": ["NY", "LA", "CHI", "MIA", "DAL"],
        "Prod_Nm": ["A", "B", "C", "D", "E"], 
        "Customer_Name": ["John", "Jane", "Bob", "Alice", "Tom"]
    })
    
    # Assign everything to strings to make checking categorical
    df = df.astype(str)
    
    classification = column_filter.ColumnClassification()
    # Apply filter manually simulating categorical check
    # Let's verify our specific functions mapped via _semantic_match
    # Product
    try:
        from app.services.analytics.semantic_resolver import semantic_similarity
        def _semantic_match(keywords, col_name, threshold=0.55):
            return any(semantic_similarity(kw, col_name) >= threshold for kw in keywords)
    except ImportError:
        def _semantic_match(keywords, col_name, threshold=0.55):
            return False
            
    assert _semantic_match(['product', 'productname', 'item', 'sku'], "Prod_Nm")
    assert _semantic_match(['country', 'state', 'city', 'region', 'province', 'location'], "CustCity")
    assert _semantic_match(['customername', 'customer_name', 'firstname', 'lastname'], "Customer_Name")

def test_kpi_engine_semantic_find():
    classification = column_filter.ColumnClassification()
    classification.metrics = ["Tot_Rev", "MonthlyChgs"]
    classification.dimensions = ["Product_Category", "CustTnr"]
    
    # Should resolve Tot_Rev
    col = kpi_engine._find_column(None, ["revenue"], classification)
    assert col == "Tot_Rev"
    
    # Should resolve CustTnr
    col = kpi_engine._find_column(None, ["tenure"], classification)
    assert col == "CustTnr"

def test_chart_recommender_find_col():
    # Test internal _find_col logic defined in chart generators
    
    # Replicate the internal function logic:
    def mock_find_col(keywords, cols, exclude=None, min_unique=None, df=None):
        exclude = exclude or []
        from app.services.analytics.semantic_resolver import semantic_similarity
        best_score = 0.0
        best_col = None

        for col in cols:
            col_norm = col.lower().replace('_', '').replace('-', '')
            if any(ex in col_norm for ex in exclude):
                continue
                
            if min_unique and df is not None and df[col].nunique() < min_unique:
                continue

            for kw in keywords:
                score = semantic_similarity(kw, col)
                if score > best_score:
                    best_score = score
                    best_col = col

        if best_col and best_score >= 0.55:
            return best_col
        return None
        
    pm = ["Tot_Rev", "MonthlyChgs", "Item_Qty"]
    pd_cols = ["CustState", "Prod_Nm"]
    
    # Should find Tot_Rev
    assert mock_find_col(['revenue', 'sales', 'amount'], pm) == "Tot_Rev"
    assert mock_find_col(['quantity', 'qty'], pm) == "Item_Qty"
    
    assert mock_find_col(['country', 'state', 'city'], pd_cols) == "CustState"
    assert mock_find_col(['product', 'item', 'sku'], pd_cols) == "Prod_Nm"


def test_safe_groupby_mean_rounds_lifecycle_metrics_to_whole_numbers():
    df = pd.DataFrame({
        "segment": ["A", "A", "B", "B"],
        "age": [31.2, 32.2, 44.6, 45.6],
    })

    result = chart_recommender._safe_groupby_mean(df, "segment", "age")
    values_by_segment = {row["name"]: row["value"] for row in result}

    assert values_by_segment["A"] == 32
    assert values_by_segment["B"] == 45


def test_infer_time_value_label_uses_age_for_age_metrics():
    assert chart_recommender._infer_time_value_label("avg age by segment") == "Age"
    assert chart_recommender._infer_time_value_label("avg tenure by segment") == "Months"
