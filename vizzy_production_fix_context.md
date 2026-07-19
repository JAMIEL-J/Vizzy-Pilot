# Vizzy Analytics — Production Fix Context File

> **Purpose**: This file is a self-contained context source for LLMs. Feed this file (or individual phases) to an LLM to systematically fix every production issue in the Vizzy Analytics codebase.
>
> **How to use**: Copy the relevant Phase section into your LLM prompt. Each fix contains the problem, file path, broken code, and exact fix code.

## 📊 Phase Completion Status (As of 2026-07-18)

- **Phase 1 — P0 Critical Security & Data Integrity**: ✅ **COMPLETED**
- **Phase 2 — P1 Performance & Reliability**: ✅ **COMPLETED**
- **Phase 3 — P2 Type Safety & Database Integrity**: ✅ **COMPLETED**
- **Phase 4 — P2 Accessibility & Rate Limiting**: ✅ **COMPLETED**
- **Phase 5 — P3 Defense in Depth**: ✅ **COMPLETED**
- **Phase 6 — P1/P3 Structural Refactoring**: ✅ **COMPLETED**

---

## PHASE 1 — P0 CRITICAL SECURITY & DATA INTEGRITY (Do First — ~2 hours)

These fixes prevent authentication bypass, data corruption, and silent failures. **Do not deploy without these.**

---

### FIX 1.1 — Authentication Bypass on DELETE Endpoint

- **Problem**: `delete_canvas_field` endpoint has NO `current_user` parameter and NO `verify_dataset_owner` call. Any unauthenticated request can delete fields from any dataset.
- **File**: `backend/app/api/canvas_routes.py` — Lines 546-551
- **Severity**: CRITICAL — unauthenticated destructive action

**Broken Code:**
```python
@router.delete("/fields/{field_name}", response_model=CanvasSchemaResponse)
async def delete_canvas_field(
    dataset_id: UUID,
    field_name: str,
    session: DBSession,
):
```

**Fixed Code:**
```python
@router.delete("/fields/{field_name}", response_model=CanvasSchemaResponse)
async def delete_canvas_field(
    dataset_id: UUID,
    field_name: str,
    session: DBSession,
    current_user: AuthenticatedUser,
):
    """
    Deletes a specific field (e.g. calculated field) from the dataset schema metadata.
    """
    from app.api.deps import verify_dataset_owner

    await verify_dataset_owner(
        dataset_id=dataset_id,
        session=session,
        current_user=current_user,
    )

    latest_version = get_latest_version(session=session, dataset_id=dataset_id)
```

**Expert Prompt**: Add `current_user: AuthenticatedUser` as a FastAPI dependency parameter to the `delete_canvas_field` function signature in `backend/app/api/canvas_routes.py` at line 546. Then add the `verify_dataset_owner` call as the first line inside the function body, identical to how `create_canvas_calculated_field` (line 380-397) does it. `AuthenticatedUser` is already imported from `app.api.deps` at line 18. The `verify_dataset_owner` should be imported inline via `from app.api.deps import verify_dataset_owner` to match the existing pattern used in other endpoints in this file.

---

### FIX 1.2 — Broken Async Write Lock (Data Corruption)

- **Problem**: In `load_csv()`, the `async with _write_lock:` block exits after a single assignment. All CSV loading, coercion, and indexing runs without lock protection. Concurrent dataset uploads will corrupt data.
- **File**: `backend/app/services/analytics/db_engine.py` — Lines 96-175
- **Severity**: CRITICAL — data corruption under concurrent load

**Broken Code:**
```python
async def load_csv(self, table_name: str, file_path: str):
    _phase_times: Dict[str, float] = {}
    _t0 = time.perf_counter()

    async with _write_lock:
        effective_path = file_path
    loaded = False          # ← THIS LINE IS OUTSIDE THE LOCK (wrong indentation)
    try:
        self._write_con.execute(...)  # ALL CSV loading runs UNPROTECTED
    ...
    if loaded:
        ...
        self._lock_down_read_con()
```

**Fixed Code:**
```python
async def load_csv(self, table_name: str, file_path: str):
    """Load a CSV file directly into DuckDB and run coercion.

    Handles non-UTF-8 encoded files by detecting encoding and
    re-encoding to UTF-8 before loading into DuckDB.
    """
    _phase_times: Dict[str, float] = {}
    _t0 = time.perf_counter()

    async with _write_lock:
        effective_path = file_path
        loaded = False
        try:
            self._write_con.execute(f'DROP TABLE IF EXISTS {safe_identifier(table_name)}')
            self._write_con.execute(
                f"CREATE TABLE {safe_identifier(table_name)} AS SELECT * FROM read_csv_auto(?)",
                [effective_path]
            )
            _phase_times["read_csv_auto"] = time.perf_counter() - _t0
            loaded = True
        except duckdb.Error as first_err:
            err_msg = str(first_err).lower()
            is_encoding_error = any(
                tok in err_msg
                for tok in ["unicode", "utf-8", "utf8", "codec", "encoding", "byte sequence"]
            )
            if not is_encoding_error:
                logger.error(f"Failed to load CSV via DuckDB: {first_err}")
                raise ValueError(f"Direct CSV load failed: {first_err}")

            logger.warning(
                "DuckDB detected encoding issue in %s. Attempting re-encoding to UTF-8.",
                file_path,
            )

            _t_reencode = time.perf_counter()
            effective_path = self._reencode_csv_to_utf8(file_path)

            try:
                self._write_con.execute(f'DROP TABLE IF EXISTS {safe_identifier(table_name)}')
                self._write_con.execute(
                    f"CREATE TABLE {safe_identifier(table_name)} AS SELECT * FROM read_csv_auto(?)",
                    [effective_path]
                )
                _phase_times["read_csv_auto_retry"] = time.perf_counter() - _t_reencode
                loaded = True
            except duckdb.Error:
                logger.warning(
                    "Re-encoded file still failed. Retrying with ignore_errors=true for %s",
                    file_path,
                )
                try:
                    self._write_con.execute(f'DROP TABLE IF EXISTS {safe_identifier(table_name)}')
                    self._write_con.execute(
                        f"CREATE TABLE {safe_identifier(table_name)} AS SELECT * FROM "
                        f"read_csv_auto(?, ignore_errors=true)",
                        [effective_path]
                    )
                    loaded = True
                except duckdb.Error as final_err:
                    logger.error(f"All CSV load strategies failed: {final_err}")
                    raise ValueError(f"Direct CSV load failed: {final_err}")

        if loaded:
            _t_coerce = time.perf_counter()
            try:
                self.coercion_results = run_coercion_pipeline(self._write_con, table_name)
            except Exception as coercion_err:
                logger.warning(f"Coercion pipeline failed (non-fatal): {coercion_err}")
                self.coercion_results = []
            _phase_times["coercion"] = time.perf_counter() - _t_coerce

            _t_index = time.perf_counter()
            create_performance_indices(self._write_con, table_name)
            _phase_times["indexing"] = time.perf_counter() - _t_index

            _phase_times["total"] = time.perf_counter() - _t0
            if any(v >= _TIMING_LOG_THRESHOLD for v in _phase_times.values()):
                _timing_summary = " | ".join(
                    f"{k}={v:.2f}s" for k, v in _phase_times.items() if v >= _TIMING_LOG_THRESHOLD
                )
                logger.info(
                    "DBEngine.load_csv timing for table '%s': %s | total=%.2fs",
                    table_name, _timing_summary, _phase_times["total"]
                )

            self._lock_down_read_con()
```

**Expert Prompt**: In `backend/app/services/analytics/db_engine.py`, the `load_csv` method (line 87) has a broken indentation that causes the `async with _write_lock:` block to exit after only one assignment (`effective_path = file_path`). Fix this by indenting EVERYTHING from `loaded = False` (line 98) through `self._lock_down_read_con()` (line 175) by one additional level so they are all inside the `async with _write_lock:` block. Match the pattern used by `load_dataframe()` at lines 64-85 where the entire operation runs inside the lock. Do not change any logic — only fix the indentation scope.

---

### FIX 1.3 — Internal Error Details Leaked to Clients

- **Problem**: Raw exception messages (`str(e)`) containing DuckDB internals, LLM provider errors, and AI-generated SQL formulas are returned in HTTP responses. This aids attacker reconnaissance.
- **File**: `backend/app/api/canvas_routes.py` — Lines 345, 460, 486
- **Severity**: HIGH — information disclosure

**Broken Code (3 locations):**
```python
# Line 345:
detail=f"Error executing SQL: {str(e)}"

# Line 460:
detail=f"AI model inference failed: {str(e)}"

# Line 486:
detail=f"Formula SQL validation failed: {str(e)}. (Attempted expression: {formula_sql})"
```

**Fixed Code:**
```python
# Line 345 — sanitize SQL execution errors:
detail="An error occurred while executing the query. Please check your SQL syntax."

# Line 460 — sanitize LLM errors:
detail="The AI model failed to generate a response. Please try rephrasing your prompt."

# Line 486 — sanitize formula validation errors:
detail="The generated formula could not be validated against the dataset. Please refine your prompt."
```

**Expert Prompt**: In `backend/app/api/canvas_routes.py`, replace the 3 HTTP error `detail` strings that expose raw `str(e)` with generic user-facing messages. The raw exception is already being logged by `logger.exception` or `logger.warning` on the lines directly above each `raise HTTPException`, so diagnostic info is preserved in server logs. The user-facing response should never contain internal stack traces, DuckDB error messages, or AI-generated SQL expressions.

---

### FIX 1.4 — Swallowed Exceptions (canvas_routes.py — 5 instances)

- **Problem**: 5 `except Exception: pass` blocks silently swallow errors. When these fail in production, there's zero diagnostic info.
- **File**: `backend/app/api/canvas_routes.py` — Lines 352, 418, 493, 564
- **Severity**: HIGH — invisible failures

**Pattern — Broken Code:**
```python
except Exception:
    pass
```

**Pattern — Fixed Code:**
```python
except Exception as e:
    logger.warning("Non-critical operation failed: %s", e)
```

**Specific fixes with context:**

```python
# Line 352 (connection close in SQL execute):
except Exception as e:
    logger.debug("Failed to close DuckDB connection: %s", e)

# Line 418 (schema_metadata JSON parse):
except Exception as e:
    logger.warning("[CANVAS] Failed to parse schema_metadata JSON: %s", e)

# Line 493 (connection close in calculate-field):
except Exception as e:
    logger.debug("Failed to close DuckDB connection: %s", e)

# Line 564 (schema_metadata JSON parse in delete):
except Exception as e:
    logger.warning("[CANVAS] Failed to parse schema_metadata for field deletion: %s", e)
```

**Expert Prompt**: In `backend/app/api/canvas_routes.py`, replace every `except Exception: pass` with `except Exception as e: logger.warning(...)` or `logger.debug(...)`. Use `logger.debug` for expected non-critical cleanups (like connection close) and `logger.warning` for unexpected data parsing failures (like JSON parse). The `logger` is already imported at line 32. Apply the same pattern across ALL other route files: `analytics_routes.py` (6 instances), `upload_routes.py` (4 instances), `sql_transparency_routes.py` (4 instances), `download_routes.py` (3 instances). Total: 32 instances across the backend.

---

### FIX 1.5 — Rotate Exposed API Keys

- **Problem**: 6 plaintext secrets in `.env` file. If ever committed to git history, they're permanently compromised.
- **File**: `.env` (root) and `backend/.env`
- **Severity**: CRITICAL — JWT forgery, billing abuse

**Action Steps (Manual — not code):**

```bash
# 1. Check if .env was ever committed:
git log --all --diff-filter=A -- .env
git log --all --diff-filter=A -- backend/.env

# 2. If any results appear, rotate ALL keys immediately:
#    - AUTH_SECRET_KEY → generate new: python -c "import secrets; print(secrets.token_urlsafe(48))"
#    - LLM_GROQ_API_KEY → regenerate at console.groq.com
#    - LLM_GROQ_CHAT_API_KEY → regenerate at console.groq.com
#    - LLM_GEMINI_API_KEY → regenerate at console.cloud.google.com
#    - LLM_GROQ_SEMANTIC_MAP → regenerate at console.groq.com
#    - LLM_NVIDIA_KEY → regenerate at build.nvidia.com

# 3. If committed, scrub from history:
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch .env backend/.env' \
  --prune-empty --tag-name-filter cat -- --all

# 4. Verify .gitignore has:
.env
backend/.env
# And REMOVE .env.example from .gitignore (it SHOULD be tracked)
```

**Expert Prompt**: Check git history for committed `.env` files. If found, rotate every API key and JWT secret immediately. The JWT `AUTH_SECRET_KEY` is the highest priority — if compromised, any attacker can mint valid tokens for any user. Generate a new one with `python -c "import secrets; print(secrets.token_urlsafe(48))"`. Also fix the `.gitignore` — currently `.env.example` is gitignored (line 36), which defeats its purpose. Remove `.env.example` from `.gitignore` so the template is tracked.

---

### FIX 1.6 — Duplicate Config Key Overwrite

- **Problem**: `LLM_PRIMARY_PROVIDER` is set twice in `.env` with conflicting values. Last one silently wins.
- **File**: `.env` — Lines 52 and 76
- **Severity**: MEDIUM — silent misconfiguration

**Broken Code:**
```env
LLM_PRIMARY_PROVIDER=gemini   # Line 52
...
LLM_PRIMARY_PROVIDER=nvidia   # Line 76 — SILENTLY OVERWRITES
```

**Fix**: Remove the duplicate at line 52. Keep only the one you actually want (line 76), or vice versa. There must be exactly one `LLM_PRIMARY_PROVIDER` in the file.

**Expert Prompt**: Search `.env` for duplicate keys using `grep -c "LLM_PRIMARY_PROVIDER" .env`. If count > 1, remove all but the one with the correct value. Decide which provider you want as primary (gemini or nvidia) and keep only that line.

---

## PHASE 2 — P1 PERFORMANCE & RELIABILITY (~1-2 weeks)

These fixes prevent performance degradation, request flooding, and excessive re-renders.

---

### FIX 2.1 — Debounce localStorage Widget Writes

- **Problem**: `useEffect` at line 217 runs `JSON.stringify(widgets)` on EVERY widget state mutation — including during real-time drag/resize operations. With 20+ widgets containing data arrays, this serializes potentially megabytes of JSON on every mouse pixel.
- **File**: `frontend/src/pages/user/CanvasPage.tsx` — Lines 216-219
- **Severity**: HIGH — performance bomb during interaction

**Broken Code:**
```typescript
// Auto-persist widgets state to local cache whenever modified
useEffect(() => {
  localStorage.setItem('vizzy_canvas_widgets', JSON.stringify(widgets));
}, [widgets]);
```

**Fixed Code:**
```typescript
// Auto-persist widgets state to local cache (debounced to avoid thrashing during drag/resize)
const widgetsPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
useEffect(() => {
  if (widgetsPersistTimerRef.current) {
    clearTimeout(widgetsPersistTimerRef.current);
  }
  widgetsPersistTimerRef.current = setTimeout(() => {
    localStorage.setItem('vizzy_canvas_widgets', JSON.stringify(widgets));
  }, 1500);
  return () => {
    if (widgetsPersistTimerRef.current) {
      clearTimeout(widgetsPersistTimerRef.current);
    }
  };
}, [widgets]);
```

**Expert Prompt**: In `CanvasPage.tsx`, replace the direct `localStorage.setItem` in the widgets persistence `useEffect` (line 217-219) with a 1500ms debounced write. Add a `useRef<ReturnType<typeof setTimeout> | null>(null)` for the timer handle. Clear the timer on cleanup. This prevents serializing the full widget array on every drag/resize pixel while still saving state after interaction pauses.

---

### FIX 2.2 — Add AbortController to Cross-Filter Re-query

- **Problem**: The cross-filter `useEffect` at line 1041 fires `Promise.all` on ALL widgets with SQL queries whenever `customFilters` changes. No debouncing, no abort on rapid toggling. Rapidly toggling filters fires overlapping network requests that race and overwrite each other.
- **File**: `frontend/src/pages/user/CanvasPage.tsx` — Lines 1041-1121
- **Severity**: HIGH — request flooding, race conditions

**Broken Code:**
```typescript
useEffect(() => {
  if (!selectedDatasetId) return;
  const updatableWidgets = widgets.filter(w => w.sql);
  if (updatableWidgets.length === 0) return;
  const activeFilters = customFilters.filter(f => f.selectedValue !== null);
  
  const executeAll = async () => {
    // ... fires immediately, no abort, no debounce
  };
  executeAll();
}, [customFilters, selectedDatasetId, selectedVersionId]);
```

**Fixed Code:**
```typescript
const crossFilterAbortRef = useRef<AbortController | null>(null);
const crossFilterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

useEffect(() => {
  if (!selectedDatasetId) return;

  const updatableWidgets = widgets.filter(w => w.sql);
  if (updatableWidgets.length === 0) return;

  const activeFilters = customFilters.filter(f => f.selectedValue !== null);

  // Cancel any in-flight request batch
  if (crossFilterAbortRef.current) {
    crossFilterAbortRef.current.abort();
  }
  // Debounce rapid filter toggles by 300ms
  if (crossFilterTimerRef.current) {
    clearTimeout(crossFilterTimerRef.current);
  }

  crossFilterTimerRef.current = setTimeout(() => {
    const controller = new AbortController();
    crossFilterAbortRef.current = controller;

    const executeAll = async () => {
      try {
        const promises = updatableWidgets.map(async (w) => {
          if (controller.signal.aborted) return { id: w.id, data: w.data, error: 'Aborted', filterOmitted: true, isKpi: w.type === 'kpi' };
          try {
            const res = await canvasService.executeSql(
              selectedDatasetId,
              selectedVersionId || '',
              w.sql || '',
              activeFilters
            );
            return {
              id: w.id,
              data: res.results,
              error: res.error,
              filterOmitted: res.filter_omitted,
              isKpi: w.type === 'kpi'
            };
          } catch (e) {
            if (controller.signal.aborted) return { id: w.id, data: w.data, error: 'Aborted', filterOmitted: true, isKpi: w.type === 'kpi' };
            console.error(`Failed to requery widget ${w.id}`, e);
            return { id: w.id, data: w.data, error: 'Failed', filterOmitted: true, isKpi: w.type === 'kpi' };
          }
        });

        const updates = await Promise.all(promises);
        if (controller.signal.aborted) return;

        setWidgets(currentWidgets => currentWidgets.map(w => {
          const update = updates.find(u => u.id === w.id);
          if (update && !update.error) {
            let updatedData = update.data || [];
            if (w.type === 'pie' || w.type === 'donut') {
              updatedData = updatedData.map((r: any) => ({ name: r.label || r.name, val: r.value || r.val }));
            }
            const titleText = String(w.title || '').toLowerCase();
            const topMatch = titleText.match(/\btop\s*(\d+)\b/);
            const titleLimit = topMatch ? parseInt(topMatch[1]) : null;
            const limit = titleLimit ?? w.limit;
            if (limit && updatedData.length > limit) {
              updatedData = updatedData.slice(0, limit);
            }
            const newWidget = { ...w, data: updatedData, filterOmitted: update.filterOmitted };
            if (update.isKpi && update.data && update.data.length > 0) {
              const firstRow = update.data[0];
              const numericKey = Object.keys(firstRow).find(k => typeof firstRow[k] === 'number');
              if (numericKey) {
                const rawValue = firstRow[numericKey];
                const metricLabel = w.targetMetricName || w.yAxisKey || numericKey;
                newWidget.value = formatKpiValue(rawValue, metricLabel, w.activeAgg || 'SUM', w.numberFormat);
              }
            }
            return newWidget;
          }
          return w;
        }));
      } catch (err) {
        if (!controller.signal.aborted) {
          console.error('Cross-filter re-query failed', err);
        }
      }
    };

    executeAll();
  }, 300);

  return () => {
    if (crossFilterTimerRef.current) clearTimeout(crossFilterTimerRef.current);
    if (crossFilterAbortRef.current) crossFilterAbortRef.current.abort();
  };
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [customFilters, selectedDatasetId, selectedVersionId]);
```

**Expert Prompt**: In `CanvasPage.tsx`, wrap the cross-filter re-query `useEffect` (lines 1041-1121) with a 300ms debounce timer and an AbortController. Add two refs (`crossFilterAbortRef` and `crossFilterTimerRef`) near the other refs. On each effect run: (1) abort the previous controller, (2) clear the previous timer, (3) set a new 300ms timer that creates a fresh AbortController and runs the queries. Check `controller.signal.aborted` before calling `setWidgets` to avoid stale updates. Return a cleanup function that clears timer and aborts controller.

---

### FIX 2.3 — Optimize Resize Handler (DOM-based like Drag)

- **Problem**: `handleResizeStart` calls `setWidgets` inside `pointermove`, triggering a full React state update per mouse pixel. The drag handler correctly uses direct DOM manipulation — resize should too.
- **File**: `frontend/src/pages/user/CanvasPage.tsx` — Lines 1342-1406
- **Severity**: HIGH — re-render per pixel during resize

**Broken Code (inside pointermove handler):**
```typescript
const handlePointerMove = (moveEvent: PointerEvent) => {
  // ...calculations...
  setWidgets(prev => prev.map(w => {     // ← React state update per pixel!
    if (w.id === widgetId) {
      return { ...w, customWidth: nextWidth, customHeight: nextHeight };
    }
    return w;
  }));
};
```

**Fixed Code:**
```typescript
const handleResizeStart = (e: React.PointerEvent<HTMLDivElement>, widgetId: string) => {
  e.stopPropagation();
  e.preventDefault();
  
  const widget = widgetsRef.current.find(w => w.id === widgetId);
  if (!widget) return;
  
  const startWidth = widget.customWidth ?? (widget.type === 'kpi' ? 245 : 375);
  const startHeight = widget.customHeight ?? (widget.type === 'kpi' ? 120 : 230);
  const startX = e.clientX;
  const startY = e.clientY;
  const dragStartWidgets = [...widgetsRef.current];

  // Find the DOM element for direct manipulation (avoids React re-renders during resize)
  const widgetEl = document.querySelector(`[data-widget-id="${widgetId}"]`) as HTMLElement | null;

  const handlePointerMove = (moveEvent: PointerEvent) => {
    const deltaX = moveEvent.clientX - startX;
    const deltaY = moveEvent.clientY - startY;
    
    let nextWidth = Math.max(150, startWidth + deltaX);
    let nextHeight = Math.max(80, startHeight + deltaY);
    
    if (gridSnap) {
      nextWidth = Math.round(nextWidth / 16) * 16;
      nextHeight = Math.round(nextHeight / 16) * 16;
    }
    
    // Direct DOM manipulation — no React re-render
    if (widgetEl) {
      widgetEl.style.width = `${nextWidth}px`;
      widgetEl.style.height = `${nextHeight}px`;
    }
  };

  const handlePointerUp = (upEvent: PointerEvent) => {
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
    
    // Compute final size and commit to React state once
    const deltaX = upEvent.clientX - startX;
    const deltaY = upEvent.clientY - startY;
    let finalWidth = Math.max(150, startWidth + deltaX);
    let finalHeight = Math.max(80, startHeight + deltaY);
    if (gridSnap) {
      finalWidth = Math.round(finalWidth / 16) * 16;
      finalHeight = Math.round(finalHeight / 16) * 16;
    }

    setWidgets(prev => prev.map(w => {
      if (w.id === widgetId) {
        return { ...w, customWidth: finalWidth, customHeight: finalHeight };
      }
      return w;
    }));

    if (startWidth !== finalWidth || startHeight !== finalHeight) {
      setPast(prev => [
        ...prev,
        {
          widgets: dragStartWidgets,
          fieldsList: fieldsListRef.current,
          checkedFields: checkedFieldsRef.current
        }
      ]);
      setFuture([]);
      addLog(`Resized component "${widget.title}" to ${finalWidth}x${finalHeight}px.`);
    }
  };

  window.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerup', handlePointerUp);
};
```

**Expert Prompt**: In `CanvasPage.tsx`, refactor `handleResizeStart` (line 1342) to use direct DOM manipulation during `pointermove` instead of calling `setWidgets`. Query the widget DOM element via `document.querySelector('[data-widget-id="..."]')` at the start. During `pointermove`, set `widgetEl.style.width` and `widgetEl.style.height` directly. On `pointerup`, compute the final width/height and call `setWidgets` once to commit. This matches the drag handler's pattern (which correctly uses `style.left`/`style.top` during drag). Each widget card in the JSX render loop needs a `data-widget-id={w.id}` attribute for this to work.

---

### FIX 2.4 — Debounce Window Resize Handler

- **Problem**: Window resize handler calls `setViewportSize` on every resize frame, triggering a full component re-render each time.
- **File**: `frontend/src/pages/user/CanvasPage.tsx` — Lines 571-581
- **Severity**: MEDIUM — unnecessary re-renders

**Broken Code:**
```typescript
useEffect(() => {
  if (typeof window === 'undefined') return;
  setViewportSize({ width: window.innerWidth, height: window.innerHeight });
  const handleResize = () => {
    setViewportSize({ width: window.innerWidth, height: window.innerHeight });
  };
  window.addEventListener('resize', handleResize);
  return () => window.removeEventListener('resize', handleResize);
}, []);
```

**Fixed Code:**
```typescript
useEffect(() => {
  if (typeof window === 'undefined') return;
  setViewportSize({ width: window.innerWidth, height: window.innerHeight });

  let resizeTimer: ReturnType<typeof setTimeout>;
  const handleResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    }, 200);
  };

  window.addEventListener('resize', handleResize);
  return () => {
    clearTimeout(resizeTimer);
    window.removeEventListener('resize', handleResize);
  };
}, []);
```

**Expert Prompt**: In `CanvasPage.tsx` line 571-581, add a 200ms debounce to the window resize handler. Use a local `setTimeout` variable, clear it on each resize event, and only set state after 200ms of no resize activity. Clean up the timer in the useEffect return.

---

### FIX 2.5 — Sync/Async Mismatch in duckdb_builder.py

- **Problem**: `get_or_build_duckdb()` is a sync function that calls `build_duckdb_from_csv()` which is `async`. Line 171 returns the coroutine object, not the result.
- **File**: `backend/app/services/analytics/duckdb_builder.py` — Lines 160-171
- **Severity**: MEDIUM — runtime crash if called from sync context

**Broken Code:**
```python
def get_or_build_duckdb(dataset_id: UUID, version_id: UUID, csv_path: str) -> Path:
    duckdb_path = get_duckdb_path(dataset_id, version_id)
    if duckdb_path.exists():
        return duckdb_path
    return build_duckdb_from_csv(dataset_id, version_id, csv_path)  # returns coroutine!
```

**Fixed Code:**
```python
async def get_or_build_duckdb(dataset_id: UUID, version_id: UUID, csv_path: str) -> Path:
    """
    Get existing DuckDB file, or build if missing.

    Idempotent - safe to call multiple times.
    """
    duckdb_path = get_duckdb_path(dataset_id, version_id)

    if duckdb_path.exists():
        return duckdb_path

    return await build_duckdb_from_csv(dataset_id, version_id, csv_path)
```

**Expert Prompt**: In `backend/app/services/analytics/duckdb_builder.py` line 160, change `def get_or_build_duckdb` to `async def get_or_build_duckdb` and add `await` before the `build_duckdb_from_csv` call on line 171. Then search the codebase for all callers of `get_or_build_duckdb` and add `await` to each call site. The function `build_duckdb_from_csv` (line 86) is already `async`, so the caller must also be `async`.

---

### FIX 2.6 — Lazy Import for html-to-image

- **Problem**: `html-to-image` is imported eagerly at the top level (line 18), loading the full library even if export is never used.
- **File**: `frontend/src/pages/user/CanvasPage.tsx` — Line 18
- **Severity**: MEDIUM — unnecessary bundle size

**Broken Code:**
```typescript
import * as htmlToImage from 'html-to-image';
```

**Fixed Code:**
```typescript
// Remove line 18 entirely.
// Then wherever htmlToImage is used (in handleExportVisuals function), use dynamic import:

const handleExportVisuals = async (format: 'png' | 'svg') => {
  const htmlToImage = await import('html-to-image');
  // ... rest of export logic using htmlToImage.toPng() / htmlToImage.toSvg()
};
```

**Expert Prompt**: In `CanvasPage.tsx`, remove the top-level `import * as htmlToImage from 'html-to-image'` at line 18. Find the `handleExportVisuals` function and add `const htmlToImage = await import('html-to-image');` as the first line inside it. This lazy-loads the library only when the user actually clicks Export.

---

## PHASE 3 — P2 TYPE SAFETY & DATABASE (~3-5 days)

---

### FIX 3.1 — Add Foreign Key Constraints to Models

- **Problem**: `owner_id`, `dataset_id`, and `created_by` have no FK references. No referential integrity.
- **Files**: `backend/app/models/dataset.py` L24, `backend/app/models/dataset_version.py` L20, L53
- **Severity**: MEDIUM — orphaned records

**Broken Code (dataset.py):**
```python
owner_id: UUID = Field(nullable=False, index=True)
```

**Fixed Code (dataset.py):**
```python
owner_id: UUID = Field(nullable=False, index=True, foreign_key="users.id")
```

**Broken Code (dataset_version.py L20):**
```python
dataset_id: UUID = Field(nullable=False, index=True)
```

**Fixed Code (dataset_version.py L20):**
```python
dataset_id: UUID = Field(nullable=False, index=True, foreign_key="datasets.id")
```

**Broken Code (dataset_version.py L53):**
```python
created_by: UUID = Field(nullable=False)
```

**Fixed Code (dataset_version.py L53):**
```python
created_by: UUID = Field(nullable=False, foreign_key="users.id")
```

**Expert Prompt**: Add `foreign_key` parameters to SQLModel `Field()` declarations. In `backend/app/models/dataset.py` line 24, add `foreign_key="users.id"` to `owner_id`. In `backend/app/models/dataset_version.py` line 20, add `foreign_key="datasets.id"` to `dataset_id`. At line 53, add `foreign_key="users.id"` to `created_by`. After making these changes, verify the table name for users in the User model matches "users". Then run `python backend/check_db.py` to verify compilation. NOTE: If you're on an existing SQLite database, you may need to recreate the database since SQLite doesn't support `ALTER TABLE ADD FOREIGN KEY` after creation.

---

### FIX 3.2 — Type the Core Data Structures (eliminate critical `any`)

- **Problem**: `CanvasWidget.data` is `any[]`, `ChatMessage.output_data` is `any`, `SavedDashboard.config` is `any`. Zero type safety.
- **Files**: `frontend/src/pages/user/CanvasPage.tsx` L132, `frontend/src/lib/api/chat.ts` L18, `frontend/src/lib/api/dashboard.ts` L7
- **Severity**: HIGH — runtime crashes from shape mismatches

**Fix Strategy (types to add in `frontend/src/types/canvas.ts` — new file):**

```typescript
// frontend/src/types/canvas.ts

export interface BarDataPoint {
  label: string;
  value: number;
  [metricKey: string]: string | number;
}

export interface LineDataPoint {
  label: string;
  value: number;
}

export interface PieDataPoint {
  name: string;
  val: number;
}

export interface KpiDataPoint {
  [key: string]: string | number;
}

export interface TableDataPoint {
  [column: string]: string | number | boolean | null;
}

export interface ScatterDataPoint {
  x: number;
  y: number;
  label?: string;
  size?: number;
}

export type ChartDataPoint =
  | BarDataPoint
  | LineDataPoint
  | PieDataPoint
  | KpiDataPoint
  | TableDataPoint
  | ScatterDataPoint;

export interface CanvasWidgetTyped {
  id: string;
  type: 'bar' | 'stacked_bar' | 'line' | 'pie' | 'donut' | 'kpi' | 'table' | 'scatter' | 'bubble' | 'combo' | 'hbar' | 'map';
  title: string;
  data: ChartDataPoint[];
  x: number;
  y: number;
  customWidth?: number;
  customHeight?: number;
  sql?: string;
  xAxisKey?: string;
  yAxisKey?: string;
  targetMetricName?: string;
  targetDimName?: string;
  activeAgg?: string;
  value?: string;
  subtext?: string;
  limit?: number;
  filterOmitted?: boolean;
  numberFormat?: import('../lib/api/canvas').NumberFormatConfig;
}
```

**Expert Prompt**: Create a new file `frontend/src/types/canvas.ts` with typed interfaces for each chart data shape. Then gradually replace `any[]` in `CanvasWidget.data` with `ChartDataPoint[]`. This is a multi-step refactor: start by defining the types, then update the `CanvasWidget` interface, then fix type errors that surface at each chart rendering callsite. Don't try to do it all at once — the discriminated union approach lets you use `widget.type` to narrow the data shape at each rendering branch.

---

## PHASE 4 — P2 ACCESSIBILITY & RATE LIMITING (~2-3 days)

---

### FIX 4.1 — Add ARIA Attributes to Canvas

- **Problem**: Zero `aria-` attributes in 5,454 lines. Entire canvas is invisible to screen readers.
- **File**: `frontend/src/pages/user/CanvasPage.tsx`
- **Severity**: HIGH — WCAG non-compliance

**Key ARIA additions (add to JSX):**

```tsx
{/* Canvas workspace container */}
<div role="application" aria-label="Vizzy Canvas workspace" ...>

{/* Widget cards in the render loop */}
<div
  role="region"
  aria-label={`Chart: ${widget.title}`}
  data-widget-id={widget.id}
  tabIndex={0}
  aria-selected={selectedWidgetIds.includes(widget.id)}
  ...
>

{/* Icon-only buttons — add aria-label to every one */}
<button aria-label="Delete widget" onClick={...}><Trash2 /></button>
<button aria-label="Download chart" onClick={...}><Download /></button>
<button aria-label="Resize widget" onClick={...}><GripVertical /></button>
<button aria-label="Toggle full screen" onClick={...}><Maximize2 /></button>

{/* Sidebar field list */}
<div role="listbox" aria-label="Dataset fields">
  {fieldsList.map(field => (
    <div role="option" aria-selected={checkedFields.includes(field.name)} ...>
```

**Expert Prompt**: Add ARIA attributes throughout CanvasPage.tsx JSX. The canvas workspace container should have `role="application"` and `aria-label="Vizzy Canvas workspace"`. Each widget card should have `role="region"`, `aria-label={widget.title}`, `tabIndex={0}`, and `aria-selected`. Every icon-only button needs an `aria-label` describing its action. The sidebar field list should have `role="listbox"` with each field as `role="option"`. Search for all `<button>` elements containing only an icon component and add appropriate `aria-label` props.

---

### FIX 4.2 — Add ARIA Attributes to Chat

- **Problem**: Zero `aria-` attributes in 1,386 lines. Screen readers can't follow conversation.
- **File**: `frontend/src/pages/user/ChatInterface.tsx`
- **Severity**: HIGH — WCAG non-compliance

**Key ARIA additions:**

```tsx
{/* Message list container */}
<div role="log" aria-label="Chat messages" aria-live="polite" ...>

{/* Individual messages */}
<div role="article" aria-label={msg.role === 'user' ? 'Your message' : 'Assistant response'} ...>

{/* Chat input */}
<textarea aria-label="Type your analytics question" ...>

{/* Session sidebar */}
<nav role="navigation" aria-label="Chat sessions">
  <ul role="list">
    <li role="listitem" aria-current={session.id === activeSessionId ? 'true' : undefined}>
```

**Expert Prompt**: Add ARIA attributes to ChatInterface.tsx. The message container needs `role="log"` and `aria-live="polite"` so screen readers announce new messages. Each message should have `role="article"`. The text input needs `aria-label`. The session sidebar needs `role="navigation"`. Every icon-only button (delete, copy, download) needs `aria-label`.

---

### FIX 4.3 — Add API Rate Limiting

- **Problem**: No rate limiting on any endpoint. Bots can flood LLM endpoints and exhaust API budgets.
- **File**: `backend/app/api/canvas_routes.py`, `backend/app/api/chat_routes.py`
- **Severity**: HIGH — cost explosion, DoS

**Fix**: The project already has a `check_rate_limit` dependency imported in `deps.py` line 15 and a `RateLimitedUser` type at line 45-48. Use it.

**Fixed Code — apply to expensive endpoints:**

```python
# In canvas_routes.py, for the compile endpoint (line 623):
from app.api.deps import DBSession, AuthenticatedUser, RateLimitedUser

async def compile_canvas_prompt(
    dataset_id: UUID,
    request: CanvasCompileRequest,
    session: DBSession,
    current_user: RateLimitedUser,  # ← Changed from AuthenticatedUser
) -> CanvasCompileResponse:

# In canvas_routes.py, for calculate-field (line 380):
async def create_canvas_calculated_field(
    dataset_id: UUID,
    request: CalculateFieldRequest,
    session: DBSession,
    current_user: RateLimitedUser,  # ← Changed from AuthenticatedUser
) -> CalculateFieldResponse:
```

**Expert Prompt**: Replace `AuthenticatedUser` with `RateLimitedUser` on all LLM-calling endpoints. `RateLimitedUser` is already defined in `deps.py` at line 45-48 and wraps `check_rate_limit`. Apply to: `compile_canvas_prompt` in `canvas_routes.py`, `create_canvas_calculated_field` in `canvas_routes.py`, and the main chat message endpoint in `chat_routes.py`. This adds per-user rate limiting to the most expensive operations without changing any other logic.

---

## PHASE 5 — P3 DEFENSE IN DEPTH (~2-3 days)

---

### FIX 5.1 — Move JWT to HttpOnly Cookies

- **Problem**: JWT stored in `localStorage` is accessible to any XSS script.
- **Files**: `backend/app/core/security.py`, `backend/app/api/auth_routes.py`, `frontend/src/lib/api/client.ts`, `frontend/src/lib/store/authStore.ts`
- **Severity**: MEDIUM — XSS token theft

**Backend changes (auth_routes.py — login response):**
```python
from fastapi.responses import JSONResponse

@router.post("/login")
async def login(credentials: LoginRequest, session: DBSession):
    user = authenticate(credentials, session)
    token = create_access_token(user)
    
    response = JSONResponse(content={"user": user.dict()})
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=True,         # HTTPS only
        samesite="lax",
        max_age=3600 * 24,   # 24 hours
        path="/api",
    )
    return response
```

**Backend changes (security.py — read from cookie):**
```python
from fastapi import Cookie

async def get_current_user(
    access_token: str = Cookie(None),
    authorization: str = Header(None),
):
    token = None
    if access_token:
        token = access_token
    elif authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]
    
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    return decode_token(token)
```

**Frontend changes (client.ts — remove localStorage token):**
```typescript
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1',
  withCredentials: true,  // ← This sends cookies automatically
});

// Remove the request interceptor that reads from localStorage
// Remove: apiClient.interceptors.request.use(config => { config.headers.Authorization = ... })
```

**Expert Prompt**: Migrate JWT from localStorage to HttpOnly cookies. Backend: set the token via `response.set_cookie(httponly=True, secure=True, samesite="lax")` in the login endpoint. Update `get_current_user` in security.py to read from `Cookie` first, falling back to `Authorization` header for backward compatibility. Frontend: add `withCredentials: true` to axios and remove the localStorage token read from the request interceptor. Remove `localStorage.setItem('vizzy_token', ...)` from authStore. Keep the `Authorization` header fallback during transition.

---

### FIX 5.2 — Add CSRF Protection

- **Problem**: No CSRF tokens on state-changing endpoints. Authenticated users visiting malicious sites can be tricked into executing actions.
- **File**: Backend middleware
- **Severity**: MEDIUM — cross-site attacks

**Fix (add CSRF middleware):**

```python
# backend/app/core/csrf.py (new file)
import secrets
from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}

class CSRFMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method in SAFE_METHODS:
            return await call_next(request)
        
        # For state-changing requests, verify CSRF token
        csrf_cookie = request.cookies.get("csrf_token")
        csrf_header = request.headers.get("X-CSRF-Token")
        
        if not csrf_cookie or not csrf_header or csrf_cookie != csrf_header:
            raise HTTPException(status_code=403, detail="CSRF validation failed")
        
        return await call_next(request)
```

```python
# In main.py, add middleware:
from app.core.csrf import CSRFMiddleware
app.add_middleware(CSRFMiddleware)
```

```typescript
// Frontend — read CSRF token from cookie and send in header:
apiClient.interceptors.request.use(config => {
  const csrfToken = document.cookie
    .split('; ')
    .find(row => row.startsWith('csrf_token='))
    ?.split('=')[1];
  if (csrfToken) {
    config.headers['X-CSRF-Token'] = csrfToken;
  }
  return config;
});
```

**Expert Prompt**: Create `backend/app/core/csrf.py` with a Starlette `BaseHTTPMiddleware` that skips safe methods (GET, HEAD, OPTIONS) and validates `X-CSRF-Token` header against `csrf_token` cookie for all other requests. Add this middleware in `main.py`. On the frontend, add an axios request interceptor that reads the `csrf_token` cookie and sends it as `X-CSRF-Token` header. The backend login endpoint should set the `csrf_token` cookie (not HttpOnly, so JS can read it) alongside the `access_token` cookie.

---

## PHASE 6 — P1/P3 STRUCTURAL REFACTORING (Ongoing — 1-2 weeks)

---

### FIX 6.1 — Decompose CanvasPage.tsx (Strategy Guide)

- **Problem**: 5,454-line monolith with 50+ useState calls
- **File**: `frontend/src/pages/user/CanvasPage.tsx`
- **Severity**: CRITICAL — velocity killer

**Decomposition plan (extract in this order):**

```
frontend/src/pages/user/canvas/
├── CanvasPage.tsx              # ~300 lines — orchestrator, imports hooks + components
├── hooks/
│   ├── useCanvasWidgets.ts     # Widget state, CRUD, undo/redo
│   ├── useCanvasDragDrop.ts    # Drag, resize, selection box, keyboard nudge
│   ├── useCanvasDatasets.ts    # Dataset/version selection, field loading
│   ├── useCanvasFilters.ts     # Cross-filtering, slicer state
│   └── useCanvasExport.ts      # PNG/SVG export, presentation mode
├── components/
│   ├── CanvasToolbar.tsx        # Top toolbar (save, load, zoom, export buttons)
│   ├── CanvasSidebar.tsx        # Fields list, calculated field input
│   ├── WidgetCard.tsx           # Single widget container (title, resize handle, context menu)
│   ├── WidgetContextMenu.tsx    # Right-click aggregation/format menu
│   ├── NumberFormatModal.tsx    # Custom format config dialog
│   └── charts/
│       ├── CanvasBarChart.tsx
│       ├── CanvasLineChart.tsx
│       ├── CanvasPieChart.tsx
│       ├── CanvasKpiCard.tsx
│       ├── CanvasTable.tsx
│       ├── CanvasScatterPlot.tsx
│       └── CanvasGeoMap.tsx
└── utils/
    ├── sqlCompiler.ts           # buildQuery, recompileQuery, validateConfig
    └── formatters.ts            # beautifyTitle, humanizeLabel, formatValue
```

**Expert Prompt**: Decompose `CanvasPage.tsx` into the folder structure above. Start with extracting hooks (lowest risk) — move state declarations and their effects into custom hooks. Then extract chart rendering functions into individual components. Finally extract the SQL compilation logic into a utility module. The key rule: each extracted module should be independently testable and under 500 lines. The main `CanvasPage.tsx` should become a thin orchestrator that imports hooks and renders components.

---

### FIX 6.2 — Implement Alembic Migrations

- **Problem**: 15 manual `_ensure_*` functions in `database.py` that ALTER TABLE. Race conditions on multi-instance startup.
- **File**: `backend/app/models/database.py` L56-346
- **Severity**: MEDIUM — fragile schema management

**Setup steps:**

```bash
cd backend
pip install alembic
alembic init alembic

# Edit alembic.ini:
# sqlalchemy.url = sqlite:///./vizzy.db

# Edit alembic/env.py to import your models:
# from app.models.base import BaseModel
# target_metadata = BaseModel.metadata

# Generate initial migration:
alembic revision --autogenerate -m "initial schema"

# Apply:
alembic upgrade head
```

**Then remove all `_ensure_*` functions from `database.py` and replace the startup call with:**

```python
from alembic.config import Config
from alembic import command

def run_migrations():
    alembic_cfg = Config("alembic.ini")
    command.upgrade(alembic_cfg, "head")
```

**Expert Prompt**: Initialize Alembic in the backend directory. Configure it to use the existing SQLModel metadata. Generate an autogenerated migration from the current models. Test that `alembic upgrade head` works on a fresh database. Then remove all 15 `_ensure_*` functions from `database.py` and replace the startup schema check with `alembic upgrade head`. This gives you versioned, idempotent, race-condition-safe migrations.

---

## EXECUTION ORDER SUMMARY

| Order | Phase | Fixes | Status | Time | Blocks Deploy? |
|---|---|---|---|---|---|
| **1st** | Phase 1 (P0) | 1.1–1.6 | ✅ **COMPLETED** | ~2 hours | ✅ YES |
| **2nd** | Phase 2 (P1) | 2.1–2.6 | ✅ **COMPLETED** | ~2-3 days | ⚠️ Recommended |
| **3rd** | Phase 3 (P2) | 3.1–3.2 | ✅ **COMPLETED** | ~3-5 days | No |
| **4th** | Phase 4 (P2) | 4.1–4.3 | ✅ **COMPLETED** | ~2-3 days | No |
| **5th** | Phase 5 (P3) | 5.1–5.2 | ✅ **COMPLETED** | ~2-3 days | No |
| **6th** | Phase 6 (P1/P3) | 6.1–6.2 | ✅ **COMPLETED** | ~1-2 weeks | No |

> **Rule**: Complete Phase 1 entirely before moving to Phase 2. Phases 3-6 can be parallelized.
