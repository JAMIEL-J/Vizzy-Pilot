# Test Configuration and Fixtures
import os
os.environ["TESTING"] = "1"

import pytest
import pandas as pd
from uuid import uuid4
from io import BytesIO


@pytest.fixture
def sample_csv_data():
    """Sample CSV data for testing file uploads."""
    csv_content = b"""id,name,sales,region,date
1,Product A,1000,North,2024-01-15
2,Product B,1500,South,2024-02-20
3,Product C,2000,East,2024-03-10
4,Product D,800,West,2024-04-05
5,Product E,3000,North,2024-05-12"""
    return BytesIO(csv_content)


@pytest.fixture
def sample_dataframe():
    """Sample DataFrame for analysis tests."""
    return pd.DataFrame({
        "id": [1, 2, 3, 4, 5],
        "name": ["Product A", "Product B", "Product C", "Product D", "Product E"],
        "sales": [1000, 1500, 2000, 800, 3000],
        "region": ["North", "South", "East", "West", "North"],
        "date": ["2024-01-15", "2024-02-20", "2024-03-10", "2024-04-05", "2024-05-12"],
    })


@pytest.fixture
def user_id():
    """Generate a random user ID."""
    return uuid4()


@pytest.fixture
def dataset_id():
    """Generate a random dataset ID."""
    return uuid4()


@pytest.fixture
def version_id():
    """Generate a random version ID."""
    return uuid4()
