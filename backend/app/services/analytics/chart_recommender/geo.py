"""
Geo Detection Helpers for map-based charts.
"""

from typing import List, Optional

US_STATE_ABBREVS = {
    'al', 'ak', 'az', 'ar', 'ca', 'co', 'ct', 'de', 'fl', 'ga',
    'hi', 'id', 'il', 'in', 'ia', 'ks', 'ky', 'la', 'me', 'md',
    'ma', 'mi', 'mn', 'ms', 'mo', 'mt', 'ne', 'nv', 'nh', 'nj',
    'nm', 'ny', 'nc', 'nd', 'oh', 'ok', 'or', 'pa', 'ri', 'sc',
    'sd', 'tn', 'tx', 'ut', 'vt', 'va', 'wa', 'wv', 'wi', 'wy', 'dc'
}

US_STATE_FULL_NAMES = {
    'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado',
    'connecticut', 'delaware', 'florida', 'georgia', 'hawaii', 'idaho',
    'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana',
    'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota',
    'mississippi', 'missouri', 'montana', 'nebraska', 'nevada',
    'new hampshire', 'new jersey', 'new mexico', 'new york',
    'north carolina', 'north dakota', 'ohio', 'oklahoma', 'oregon',
    'pennsylvania', 'rhode island', 'south carolina', 'south dakota',
    'tennessee', 'texas', 'utah', 'vermont', 'virginia', 'washington',
    'west virginia', 'wisconsin', 'wyoming', 'district of columbia'
}

COUNTRY_KEYWORDS = {
    'usa', 'us', 'united states', 'uk', 'united kingdom', 'germany',
    'france', 'china', 'india', 'brazil', 'australia', 'canada',
    'japan', 'russia', 'mexico', 'italy', 'spain', 'south korea',
    'indonesia', 'argentina', 'turkey', 'netherlands', 'saudi arabia'
}

WORLD_KEYWORDS = {
    'usa', 'us', 'united states', 'uk', 'gb', 'united kingdom', 'germany', 'de',
    'france', 'fr', 'china', 'cn', 'india', 'in', 'brazil', 'br', 'australia', 'au', 'canada', 'ca',
    'japan', 'jp', 'russia', 'ru', 'mexico', 'mx', 'italy', 'it', 'spain', 'es', 'south korea', 'kr'
}

def _detect_map_type(col_values: List[str]) -> Optional[str]:
    """
    Detect the appropriate map type based on the values in a geo column.
    Returns: 'us_states', 'world'
    """
    if not col_values:
        return 'world'

    sample_raw = [str(v).lower().strip() for v in col_values[:100]]

    # 1. Check for US State abbreviations (e.g. CA, TX, NY)
    abbrev_matches = sum(1 for v in sample_raw if v in US_STATE_ABBREVS)
    if abbrev_matches / max(len(sample_raw), 1) > 0.3:
        return 'us_states'

    # 2. Check for US State full names
    full_matches = sum(1 for v in sample_raw if v in US_STATE_FULL_NAMES)
    if full_matches / max(len(sample_raw), 1) > 0.3:
        return 'us_states'

    # 3. Check for explicit "World" indicators
    world_indicator_matches = sum(1 for v in sample_raw if v in WORLD_KEYWORDS)
    if world_indicator_matches > 0:
        return 'world'

    # 4. Require at least SOME matches to call it a world map, otherwise None
    if world_indicator_matches > 0 or abbrev_matches > 0 or full_matches > 0:
        return 'world'

    return None
