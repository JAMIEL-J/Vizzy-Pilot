"""
Models layer package.

Defines data contracts, database schemas, and immutability rules.
All models inherit from BaseModel for consistent identity and timestamps.
"""

from .chart_customization import ChartCustomization

__all__ = ["ChartCustomization"]
