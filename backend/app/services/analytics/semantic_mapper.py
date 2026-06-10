"""
Semantic Mapper - LLM-assisted role mapping for dataset columns.

This service uses a combination of data profiles and column names to map
raw columns to a constrained vocabulary of semantic roles.
"""

import json
import logging
from typing import Dict, Any, List, Optional, Tuple
from dataclasses import dataclass, asdict
from app.services.analytics.data_profiler import ColumnProfile
from app.services.llm.llm_router import LLMRouter
from app.services.analytics.pre_mapper import PreMapper
from app.services.semantic_audit import ROLE_TAXONOMY, ROLE_VOCABULARY_FOR_LLM
import re

logger = logging.getLogger(__name__)

@dataclass
class ColumnMapping:
    column_name: str
    role: str
    evidence: str
    confidence: float

@dataclass
class SemanticMap:
    dataset_id: str
    domain: str
    mappings: Dict[str, str] # role -> column_name
    metadata: Dict[str, Any]

class SemanticMapper:
    # Vocabulary is imported from semantic_audit.py (single source of truth)
    ROLE_VOCABULARY = ROLE_VOCABULARY_FOR_LLM

    SYSTEM_PROMPT = (
        "You are an expert data analyst specializing in dataset profiling and semantic column classification. "
        "You analyze column names, data types, and sample values to assign semantic roles. "
        "You ALWAYS respond with valid JSON only — no explanations, no markdown, no extra text."
    )

    def __init__(self):
        from app.core.llm_client import get_llm_client
        self.client = get_llm_client()

    async def propose_mapping(self, dataset_id: str, columns_profiles: Dict[str, ColumnProfile]) -> Dict[str, Any]:
        """
        Analyzes column profiles and names to propose a semantic mapping.
        Uses a two-stage process: PreMapper (deterministic) -> LLM (probabilistic).
        """
        # 1. Stage 1: Deterministic Pre-Mapping
        pre_mapper = PreMapper()
        pre_mappings = pre_mapper.pre_map_dataset(columns_profiles)

        # 2. Stage 2: LLM-assisted mapping for the remaining columns
        remaining_cols = {col: prof for col, prof in columns_profiles.items() if col not in pre_mappings}

        if not remaining_cols:
            return self._structure_response(pre_mappings)

        # Helper function to map a batch of columns
        async def map_batch(batch_cols):
            profile_context = []
            for col_name, profile in batch_cols.items():
                p_dict = profile.to_dict()
                signal = {
                    "name": col_name,
                    "type": p_dict["dtype"],
                    "cardinality": round(p_dict["cardinality"], 2),
                    "is_numeric": p_dict["is_numeric"],
                    "is_datetime": p_dict["is_datetime"],
                    "is_categorical": p_dict["is_categorical"],
                    "is_identifier": p_dict["is_identifier"],
                    "is_binary": p_dict["is_binary"],
                    "is_currency": p_dict["is_currency_pattern"],
                    "samples": p_dict.get("samples", [])
                }
                profile_context.append(json.dumps(signal))

            context_str = "\n".join(profile_context)

            # Group roles for the LLM prompt
            grouped_roles = """### ROLE VOCABULARY (Grouped — pick EXACTLY ONE per column)
**Temporal** (use for time-series X axis ONLY):
  date, datetime, year_month, fiscal_period

**Dimension** (use for group-by / categorical axis):
  category, sub_category, geography

**Identity** (no chart output — filtering/reference only):
  entity_id, primary_key, foreign_key, name_label

**Flag/Target** (binary or outcome indicators):
  boolean_flag, target

**Measure** (numeric Y axis values):
  revenue, cost, profit, quantity, count, score, ratio_pct, duration_seconds, tenure

**Fallback**:
  unclassified — use ONLY when no other role fits after examining samples

### CRITICAL: TENURE vs DATE
Columns like Tenure_Months, Years_Experience, Age, Seniority are NUMERIC MEASURES (role="tenure"), NOT temporal dimensions.
Only assign date/datetime if the column contains actual calendar dates (e.g., 2024-01-15, 01/15/2024).
"""
            vocab_descriptions = json.dumps(self.ROLE_VOCABULARY, indent=2)

            prompt = f"""
You are a Senior Data Architect. Your task is to perform a Semantic Audit of a dataset.
You must map each column to exactly ONE role from the provided vocabulary.

{grouped_roles}

### ROLE DESCRIPTIONS
{vocab_descriptions}

### COLUMN PROFILES (Actual Data Samples & Stats)
{context_str}

### AUDIT GUIDELINES
1. **Evidence-First Approach**: You MUST justify your choice by citing at least 2 specific values from the 'samples' list.
2. **Strict Role Mapping**:
   - **Revenue/Cost/Profit**: Look for currency symbols, 2-decimal floats, positive ranges.
   - **Date/DateTime**: Look for ISO formats (YYYY-MM-DD), timestamps, or date-like strings. NOT numeric counters.
   - **Tenure**: Look for numeric values representing duration (months, years) where the column name suggests tenure, experience, age, seniority. These are MEASURES.
   - **Category**: Look for repeating strings with low-to-medium cardinality (e.g., "North", "South").
   - **Geography**: Look for location names (countries, states, cities, regions).
   - **Identifier**: Look for high-cardinality alphanumeric strings or unique integers (UUIDs, IDs).
   - **Target**: Look for binary indicators (0/1, Yes/No) or specific status labels (Churned/Active).
3. **No Hallucinations**: If the samples and stats provide zero evidence for a role, you MUST use 'unclassified'. Do not invent a role.
4. **Confidence Scoring**:
   - 0.9-1.0: Exact match (e.g., column named 'Revenue' with currency float samples).
   - 0.6-0.8: Strong profile match but generic name (e.g., 'C_01' with float samples).
   - 0.1-0.5: Weak match, based on a "best guess" of the data pattern.

### OUTPUT FORMAT (STRICT JSON)
Return a single JSON object where keys are column names and values are nested objects.
Map EVERY provided column. Do not omit any. Do not use "..." or summarize.
Example:
{{
  "sales_per_order": {{
    "role": "revenue",
    "evidence": "Values $129.95, $54.20 — 2-decimal currency pattern",
    "confidence": 0.95
  }},
  "tenure_months": {{
    "role": "tenure",
    "evidence": "Values 12, 24, 36 — numeric months, not calendar dates",
    "confidence": 0.90
  }}
}}

IMPORTANT: Return ONLY raw JSON enclosed in {{}}. No markdown, no explanation.
"""
            try:
                llm_response = await self.client.complete(
                    system_prompt=self.SYSTEM_PROMPT,
                    user_prompt=prompt,
                    purpose="semantic_mapping",
                    response_format={"type": "json_object"}
                )
                
                raw_content = llm_response.content
                response = self._parse_llm_response(raw_content)
                
                is_wrapper = isinstance(response, dict) and isinstance(response.get('__raw_text__'), str)
                if is_wrapper:
                    extracted = self._extract_from_free_text(response['__raw_text__'])
                    if extracted: response = extracted
                    else:
                        extracted = self._extract_from_free_text(raw_content)
                        if extracted: response = extracted
                        else: response = {}
                
                if isinstance(response, str):
                    extracted = self._extract_from_free_text(response)
                    if extracted: response = extracted
                
                if not isinstance(response, dict):
                    return {}
                return response

            except Exception as e:
                logger.error(f"Semantic mapping batch failed: {str(e)}")
                return {}

        import asyncio
        batch_size = 20  # Reduced to 20 to prevent LLM from omitting columns (laziness)
        items = list(remaining_cols.items())
        batches = [dict(items[i:i + batch_size]) for i in range(0, len(items), batch_size)]
        
        logger.info(f"Processing {len(remaining_cols)} columns in {len(batches)} batches.")
        results = await asyncio.gather(*(map_batch(b) for b in batches))
        
        # Merge results
        final_response = {}
        for r in results:
            if isinstance(r, dict):
                final_response.update(r)

        # Validate and structure the output
        structured = self._structure_response(final_response)

        # Fallback: Ensure all original columns are present
        for col_name in columns_profiles.keys():
            if col_name not in pre_mappings and col_name not in structured["mappings"]:
                structured["mappings"][col_name] = "unclassified"
                structured["metadata"]["proposals"].append(asdict(ColumnMapping(
                    column_name=col_name,
                    role="unclassified",
                    evidence="LLM extraction failed or skipped column; defaulted to unclassified",
                    confidence=0.0
                )))

        return structured

    def _parse_llm_response(self, raw_text: str) -> Dict[str, Any]:
        """
        Parse the raw LLM text into a dict.
        Handles: clean JSON, markdown-fenced JSON, JSON embedded in prose.
        """
        cleaned = raw_text.strip()

        # 1. Strip markdown code fences
        if "```" in cleaned:
            match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned)
            if match:
                cleaned = match.group(1).strip()

        # 2. Try direct JSON parse
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            pass

        # 3. Find outermost JSON object in the text
        first_brace = cleaned.find("{")
        last_brace = cleaned.rfind("}")
        if first_brace != -1 and last_brace > first_brace:
            candidate = cleaned[first_brace:last_brace + 1]
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                logger.warning(f"Embedded JSON parse failed: {candidate[:200]}")

        # 4. Fallback: wrap as text for downstream heuristic extraction
        return {"__raw_text__": cleaned}

    def _normalize_response(self, response: Any) -> Dict[str, Any]:
        """
        Normalize likely LLM response shapes into {column_name: mapping_payload}.
        """
        if not isinstance(response, dict):
            return {}

        # 1. Handle common wrapper payloads.
        candidate = response.get("mappings", response)
        if not isinstance(candidate, dict):
            if isinstance(candidate, list) and len(candidate) > 0:
                for item in candidate:
                    if isinstance(item, dict):
                        candidate = item
                        break
            else:
                return {}

        normalized: Dict[str, Any] = {}
        for key, value in candidate.items():
            # --- Case A: Standard shape { "column_name": { "role": "...", ... } } ---
            if isinstance(value, dict) and "role" in value:
                normalized[key] = value
                continue

            # --- Case B: Compact shape { "column_name": "role_name" } ---
            if isinstance(value, str):
                val_lower = value.strip().lower()
                if val_lower in self.ROLE_VOCABULARY:
                    normalized[key] = {
                        "role": val_lower,
                        "evidence": "Role inferred from compact output",
                        "confidence": 0.7,
                    }
                    continue

            # --- Case C: Inverse compact shape { "role_name": "column_name" } ---
            if isinstance(key, str):
                key_lower = key.strip().lower()
                if key_lower in self.ROLE_VOCABULARY:
                    # Value must be the column name
                    if isinstance(value, str):
                        normalized[value] = {
                            "role": key_lower,
                            "evidence": "Role inferred from inverse compact output",
                            "confidence": 0.7,
                        }
                        continue

            # --- Fallback ---
            # ONLY use the key as the column name if it's NOT a known role.
            if isinstance(key, str) and key.strip().lower() not in self.ROLE_VOCABULARY:
                normalized[key] = {
                    "role": "unclassified",
                    "evidence": f"Unsupported output shape for {key}; defaulted to unclassified",
                    "confidence": 0.0,
                }

        return normalized

    def _extract_from_free_text(self, text: str) -> Dict[str, Any]:
        """
        Try to extract a mapping payload from free-form LLM text.
        Handles narrative responses by finding the outermost JSON object.
        """
        if not text or not isinstance(text, str):
            return {}

        # 1. Attempt to find the outermost JSON object { ... }
        start_idx = text.find('{')
        end_idx = text.rfind('}')

        if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
            candidate = text[start_idx : end_idx + 1]
            try:
                # Basic string load
                parsed = json.loads(candidate)
                if isinstance(parsed, dict):
                    return parsed
            except json.JSONDecodeError:
                # Remove trailing commas before closing braces/brackets
                cleaned = re.sub(r",\s*([\}\]])", r"\1", candidate)
                try:
                    parsed = json.loads(cleaned)
                    if isinstance(parsed, dict):
                        return parsed
                except json.JSONDecodeError as e:
                    # If still a JSON error, the LLM might have used markdown lists.
                    logger.error(f"Embedded JSON parse failed recursively: {cleaned[-100:]}")
                    # Match block format (optionally with markdown around the column name)
                    block_regex = r'[\"\`]?([^"\'\`\n]+)[\"\`]?\s*[:\-]\s*\{\s*"role"\s*:\s*"([^"]+)"\s*,\s*"evidence"\s*:\s*"([^"]*)"\s*,\s*"confidence"\s*:\s*([0-9.]+)\s*\}'
                    matches = list(re.finditer(block_regex, candidate))
                    
                    if matches:
                        rescued_mappings = {}
                        for m in matches:
                            col_name = m.group(1)
                            rescued_mappings[col_name] = {
                                "role": m.group(2),
                                "evidence": m.group(3),
                                "confidence": float(m.group(4))
                            }
                        logger.info(f"Rescued {len(rescued_mappings)} mappings via regex instead of JSON parse.")
                        return rescued_mappings

        # 2. Fallback: Line-based heuristics
        mappings: Dict[str, Any] = {}
        for line in text.splitlines():
            line = line.strip().strip('`').strip()
            if not line: continue

            m = re.split(r"\s*[:\-–\s>+]+", line)
            if len(m) >= 2:
                left, right = m[0].strip().strip('"\''), m[1].strip().strip('"\'')
                if right.lower() in self.ROLE_VOCABULARY:
                    mappings[left] = {"role": right.lower(), "evidence": "Parsed from text", "confidence": 0.6}
                elif left.lower() in self.ROLE_VOCABULARY:
                    mappings[right] = {"role": left.lower(), "evidence": "Parsed from text", "confidence": 0.6}

        return mappings

    def _structure_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """
        Ensure the response follows the expected structure and filter out invalid roles.
        """
        valid_mappings = {}
        metadata = {"proposals": []}

        normalized = self._normalize_response(response)

        for col, data in normalized.items():
            role = data.get("role", "unclassified") if isinstance(data, dict) else "unclassified"
            # Force role into vocabulary
            if role not in ROLE_TAXONOMY:
                role = "unclassified"

            valid_mappings[col] = role # Correct: Map column -> role for the UI

            metadata["proposals"].append(asdict(ColumnMapping(
                column_name=col,
                role=role,
                evidence=data.get("evidence", "No evidence provided") if isinstance(data, dict) else "No evidence provided",
                confidence=data.get("confidence", 0.0) if isinstance(data, dict) else 0.0
            )))

        return {
            "mappings": valid_mappings,
            "metadata": metadata
        }
