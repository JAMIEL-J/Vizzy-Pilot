# Multi-Step Query Execution Loop — Implementation Spec

**Status:** Locked design, ready for implementation
**Owner:** Vizzy Chat Analytics — `backend/app/services/analytics/executor.py`
**Do not deviate from this document.** No new agents, no new toggles, no new endpoints. If the build hits a gap this doc doesn't cover, stop and ask — do not improvise.

---

## 1. Problem Statement

`Executor.run_query()` currently runs Strategist → Coder → Critic → Synthesizer exactly once per user message. The Strategist plans a multi-step `steps` array, but the Coder collapses the entire plan into a single SQL query (typically via CTEs), decided *before* any real data exists.

This fails for any question where step N's query depends on step N-1's **actual returned values** — causal drill-downs ("why did revenue drop"), adaptive comparisons, sequential narrowing. No CTE can express "query the segment that turns out to have the biggest deviation" because that segment isn't known until a prior query runs.

**Fix:** Replace the single Coder call with a bounded, iterative loop: generate query → execute → observe real result → decide next query or stop → repeat.

---

## 2. Explicit Non-Goals (do not build these)

- Clarifying questions on ambiguous queries
- Statistical/causal rigor beyond the one guardrail in §5
- Robustness on unfamiliar/messy schemas
- A new user-facing toggle for this feature (it is NOT gated by the `Think` toggle)
- A separate pre-execution SQL Critic call (removed, see §4)
- Any new class/module beyond one new private method on `Executor`
- Parallel step execution, recursion, or speculative multi-branch planning

---

## 3. Architecture Decision

Implement as **one new private method on the existing `Executor` class**: `_run_step_loop()`.

- Called once from `run_query()`, replacing the current single Coder→Critic call.
- Owns: step counter, accumulator list, per-step Coder retry-on-error logic.
- `run_query()` itself changes minimally — calls `_run_step_loop()`, then passes the accumulated results to the existing Synthesizer phase.
- **Rejected alternatives:** standalone orchestrator class (unnecessary isolation, YAGNI at this stage — revisit only if step logic later needs parallelism or multiple step types); recursive step execution (no benefit given a small fixed cap, costs debuggability in async Python).

---

## 4. Strategist Contract Change (required, not optional)

The Strategist's existing single JSON-output call MUST be extended with one new required field:

```json
{
  "analysis_intent": "...",
  "steps": [...],
  "planned_step_count": <integer, 1-3>
}
```

**Rule for the Strategist prompt:** `planned_step_count` = 1 unless the question requires seeing intermediate results before the next query can be written (e.g. "why did X drop," "what's driving Y," "compare A vs B where A/B aren't both explicitly named"). Simple aggregation, filtering, grouping, or single-dimension ranking questions are ALWAYS `planned_step_count: 1` — do not let surface complexity ("which category performs best") inflate this; if it resolves in one `GROUP BY`/`ORDER BY`, it is 1 step.

This field is what allows `_run_step_loop` to short-circuit simple queries at the same cost as today. Without it, every query pays for a wasted decision call. This is not a nice-to-have — it is required for the design to work as specified.

---

## 5. Per-Step Execution Contract

Replace the current pre-execution Critic validation entirely. New contract per step:

1. **Coder** generates SQL for the current step (given: original question, prior steps' results if any, current step's stated intent).
2. **Execute directly against DuckDB.** No pre-execution semantic/syntax review call.
3. **On DB error:** feed the exact DuckDB error message back to the Coder, retry. **Max 2 total Coder attempts per step** (not 3 — DB errors are deterministic and almost always fixable in one retry).
4. **On successful execution:**
   - If this step is **not** the final step (i.e., loop hasn't hit the cap AND a prior decision call hasn't already said "stop"): run **one merged call** that does BOTH:
     a. **Guardrail check** — before treating any deviation/segment as significant, sanity-check magnitude and stability (e.g., is this segment's volume/sample size large enough that the swing is meaningful, not noise). If it fails the guardrail, the decide-call must route around it (pick the next-largest legitimate signal, or terminate with "no reliable driver found").
     b. **Next-step decision** — "is there enough information to answer the original question, or is another step needed?" Output: `{"sufficient": bool, "next_step_intent": "..." | null}`.
   - If this step **is** the final step (cap reached, i.e., step 3 with `planned_step_count > 1` and loop still running): **skip the merged call entirely.** Do not spend an extra LLM call here — the Synthesizer inherits the guardrail/sufficiency judgment as part of its normal narrative pass (see §7).

---

## 6. Step Cap

**Hard cap: 3 steps total.** No config flag, no per-request override. If `_run_step_loop` reaches step 3, it stops regardless of the merged call's output (and per §5, step 3 doesn't even run the merged call).

---

## 7. Synthesizer Changes

- Input: the accumulator list of `{step_number, intent, sql, result, guardrail_note}` for all executed steps (1 to 3 entries).
- For the case where step 3 was reached without a prior "sufficient" signal, the Synthesizer's existing prompt must be extended with one instruction: apply the same magnitude/stability sanity check from §5a before stating a causal claim, since no dedicated guardrail call ran for the final step.
- **Chart data:** the final visual (`ChartRenderer.tsx` payload) is built from the **last executed step's result only**, never a merge across steps. This is an explicit assumption — confirm before/during implementation if this is wrong; do not silently deviate.

---

## 8. Progress UX

Reuse the **existing** SSE `progress_callback` infrastructure. No new event types, no new frontend component changes required beyond message text. Emit one event per step transition, e.g.:

```
"Step 2 of 3: checking APAC revenue by product"
```

If `planned_step_count == 1`, emit the same single "Analyzing your question..." style message as today — no step counter shown for single-step queries.

---

## 9. Failure Handling

- If a step's Coder exhausts its 2 attempts without a clean execution: **stop the loop at this step.** Pass whatever prior steps succeeded (if any) to the Synthesizer. Do not retry the whole loop, do not skip to a different step.
- If step 1 itself fails after 2 attempts: pass the error state through to the Synthesizer as today's system already does on failure (no new error-handling path — reuse existing behavior).

---

## 10. Cost Envelope (for reference, not a config target)

- Simple query (`planned_step_count: 1`): Strategist(1) + Coder(1, or 2 on retry) + Synthesizer(1) = **3-4 calls**, matching current system cost.
- Worst-case multi-step (3 steps, retries on first two): Strategist(1) + [Coder×2 + merged call](step 1) + [Coder×2 + merged call](step 2) + Coder×2(step 3, no merged call) + Synthesizer(1) = **~10 calls**. This is expected to occur only on genuinely multi-hop causal/comparative questions, not on every request.

---

## 11. Decision Log

| # | Decision | Alternatives rejected | Rationale |
|---|---|---|---|
| 1 | Scope: sequential, data-dependent execution only | Stat rigor, clarifying Qs, schema robustness | Confirmed as the actual bottleneck; others are separate future work |
| 2 | Step cap = 3 | 4 (too costly), 2 (too shallow for causal chains) | Balances depth vs. cost |
| 3 | Execute-then-fix-on-error, not validate-then-execute | Keep pre-execution Critic | DuckDB's own error is free ground truth |
| 4 | Merge guardrail-check + next-step-decision into one call | Two separate calls | Both need identical context (the real result); no reason to pay twice |
| 5 | Final step skips merged call; Synthesizer absorbs judgment | Always run merged call | No decision needed once stopping regardless |
| 6 | Gating via `planned_step_count` in existing Strategist call | New toggle, separate classifier pre-check | Zero added latency for simple queries; hard requirement, not optional |
| 7 | Guardrail: magnitude/stability check before causal claims | Skip / defer entirely | Cheap, prevents confidently explaining noise |
| 8 | Coder retry cap per step = 2 (not 3) | Keep at 3 | DB errors are deterministic; 3 was sized for semantic disagreement, not applicable here |
| 9 | Chart payload = last step's result only | Merge across steps | Simplest; explicitly flagged as an assumption pending confirmation |
| 10 | Implementation = one new method on `Executor`, no new class | Standalone orchestrator class | YAGNI; nothing today requires that isolation |

---

## 12. Critical Test Cases (Mandatory — Implementation Is Not Done Without These)

Passing "it compiles and answers a question" is not acceptance criteria. These are. Every test below maps to a specific decision in §11 — if a test can't be written for a decision, that decision wasn't specified precisely enough and needs to go back to design, not get skipped.

### 12.1 Gating correctness (Decision #6 — the whole cost argument depends on this)

- **T1 — Simple query call count.** Run a single-aggregation question ("total revenue", "overall sales and profit") through the finished system. Assert `planned_step_count == 1` in the Strategist's actual output, AND assert the merged guardrail/decision call (§5.4) is never invoked. Count total LLM calls end-to-end — must be 3-4, not 5+. **This is the single most important test in this document.** If it fails, the entire cost-containment design failed silently and every query is now paying the multi-step tax regardless of complexity.
- **T2 — False-simple rejection.** Feed a question that sounds simple but has a hidden dependency (e.g., "which region needs the most attention" — ambiguous, could require magnitude+trend comparison). Assert the Strategist does NOT default to `planned_step_count: 1` just because the surface phrasing is short. This test exists because §4 explicitly warns the Strategist not to be fooled by short phrasing — verify the prompt actually resists that, don't just trust the instruction worked.
- **T3 — Multi-step correctly triggers.** Feed an explicit causal question ("why did revenue drop last month"). Assert `planned_step_count > 1` and that step 2's generated SQL query is provably different from what step 1 would have produced in isolation (i.e., it actually used step 1's result, not just restated the plan).

### 12.2 Step loop mechanics (Decisions #2, #5, #8)

- **T4 — Cap enforcement.** Force a scenario where the merged decision call would keep saying "insufficient, need another step" indefinitely (mock this). Assert the loop hard-stops at step 3 regardless, and that step 3 does NOT invoke the merged call (§5, final-step skip).
- **T5 — Early sufficiency exit.** Feed a 2-hop question where step 2's result is genuinely sufficient. Assert the loop stops after step 2 and does NOT run a 3rd step just because the cap allows it. (This is the inverse failure of T4 — verify the system isn't burning the full cap by default.)
- **T6 — Coder retry cap = 2, not 3.** Force a SQL error on the first Coder attempt (bad column name, mock the DB response). Assert exactly one retry occurs with the real DuckDB error message fed back verbatim into the retry prompt, and that a second consecutive failure terminates the step (does not attempt a 3rd time). This directly tests Decision #8 — if this passes with 3 attempts instead of 2, the retry-cap change wasn't actually implemented, just documented.

### 12.3 Failure and partial-result handling (§9)

- **T7 — Step 1 total failure.** Force both Coder attempts on step 1 to fail. Assert the system reaches the Synthesizer with an explicit failure/error state (not an empty accumulator silently treated as "answer with nothing"), and that the user-facing response reflects an inability to answer — not a fabricated answer from zero data.
- **T8 — Partial success (step 2 fails after step 1 succeeds).** Assert the Synthesizer receives step 1's real result and is explicitly told step 2 failed, and that the final answer is scoped to only what step 1 actually established — it must not claim conclusions that required step 2's data.

### 12.4 Guardrail correctness (Decision #7 — this is the one that prevents confidently explaining noise)

- **T9 — Guardrail correctly rejects a false driver.** Construct a dataset where one segment has a large % swing but trivially low volume (e.g., a region with 3 total transactions swinging 200%) alongside a segment with a moderate % swing but high volume. Assert the merged decision call does NOT select the low-volume/high-swing segment as "the driver" — assert it either picks the stable high-volume signal or explicitly reports no reliable driver found. **This is the test that catches the exact failure mode discussed earlier in this design: chasing the loudest number instead of the real one.**
- **T10 — Guardrail on the final (cap-reached) step.** Force a 3-step scenario where step 3 is genuinely the last one and contains a low-volume anomaly. Assert the Synthesizer (not a merged call, since step 3 skips it per §5) still correctly declines to state it as a causal driver — verifying the guardrail logic actually got moved into the Synthesizer prompt as specified in §7, not silently dropped when the merged call was skipped.

### 12.5 Regression checks (things this build must NOT break)

- **T11 — Think toggle independence.** Run the same multi-step question with Think ON and Think OFF. Assert `planned_step_count` and the number of steps executed are IDENTICAL between the two runs — only the Synthesizer's narrative style should differ. If step count changes based on Think, Decision #6 ("not tied to Think toggle") was violated.
- **T12 — SSE progress format unchanged for simple queries.** For a `planned_step_count: 1` query, assert the SSE events emitted match today's existing single-shot progress messages exactly (no step counter injected). Only multi-step queries should show "Step X of Y."
- **T13 — Chart payload source.** For a multi-step query, assert the `ChartRenderer.tsx` payload is built exclusively from the final executed step's result set, never a merge/concatenation of multiple steps' data. **This test is blocked until you confirm the §7 assumption below — do not write this test against an unconfirmed assumption and call it done.**

### 12.6 Cost verification (§10 — numbers, not vibes)

- **T14 — End-to-end call count audit.** Instrument actual LLM call counts (not estimated) for: one `planned_step_count: 1` query, one 2-step query, one 3-step query with retries on every step. Compare against §10's stated envelope (3-4 / ~7 / ~10). If actual counts exceed the documented envelope by more than 1-2 calls, the implementation deviated from the spec somewhere and needs to be traced back — do not just update the doc to match reality without finding out why they diverged.

---

## 13. Completion Report Requirement (Mandatory — Do Not Skip)

When implementation is complete, the reporting-back summary MUST follow this exact format. A summary that says "tests passed" or "implementation works as expected" with no numbers is an incomplete report and must be rejected — send it back for the actual data.

**Required report structure:**

```
### Test Results (T1–T14)

T1 — Simple query call count: [ACTUAL total LLM calls measured], planned_step_count = [value]
     merged call invoked? [yes/no]
T2 — False-simple rejection: planned_step_count returned = [value] for test question "[exact question used]"
T3 — Multi-step trigger: planned_step_count = [value], step 2 SQL diff from step 1 shown = [yes/no, paste both queries]
T4 — Cap enforcement: loop stopped at step [N], merged call on final step = [yes/no — must be no]
T5 — Early exit: stopped after step [N] out of cap of 3
T6 — Retry cap: [N] attempts occurred before termination (must be ≤2), 
     failure rate observed across test runs = [X out of Y attempts failed on 1st try]
T7 — Step 1 total failure: Synthesizer received [error state / empty accumulator — specify which]
T8 — Partial success: final answer scope = [did it correctly avoid claiming step-2-dependent conclusions? yes/no]
T9 — Guardrail rejection: selected signal = [which segment], correctly avoided low-volume segment = [yes/no]
T10 — Final-step guardrail (via Synthesizer): correctly declined causal claim = [yes/no]
T11 — Think toggle independence: step count with Think ON = [N], with Think OFF = [N] (must match)
T12 — SSE format for simple query: matches existing single-shot format = [yes/no]
T13 — Chart payload source: confirmed last-step-only = [yes/no]
T14 — Cost envelope audit:
     Simple query:  [actual] vs documented 3-4
     2-step query:  [actual] vs documented ~7
     3-step query:  [actual] vs documented ~10

### Deviations From Spec
[Anything that didn't work as written, what was changed instead, and why. 
 "None" is only acceptable if literally true — do not write "None" to avoid explaining a shortcut.]

### Open Issues / Things That Failed
[Any test that did not pass. Do not omit failing tests from the report.]
```

**Rule for whoever is implementing this:** if a test can't be run yet (e.g., no multi-table data to test T3 realistically), say so explicitly — "T3 not run: no dataset available with clear causal drill-down structure" — rather than guessing at a result or skipping the line silently.

---

## 14. Build Prompt for Implementation Agent

Use this verbatim as the instruction to whichever LLM/agent writes the code:

> You are implementing a scoped change to `backend/app/services/analytics/executor.py` in the Vizzy Chat Analytics system. You are acting as a senior backend engineer, not a creative collaborator — **do not add features, agents, toggles, or abstractions beyond what is specified below.** If something is ambiguous, stop and ask rather than guessing.
>
> **Task:** Replace the current single-shot Coder→Critic call inside `Executor.run_query()` with a new private method `_run_step_loop()` that supports data-dependent multi-step SQL execution, per the attached spec (sections 3–9). 
>
> **Hard constraints:**
> 1. Do not create a new class. This is one method on the existing `Executor`.
> 2. Do not touch the `Think` toggle logic — it remains solely a Synthesizer prompt switch, unrelated to this change.
> 3. The Strategist's JSON schema gets exactly one new required field: `planned_step_count` (integer, 1–3). Do not add other new fields.
> 4. Remove the pre-execution Critic call. Replace with execute-then-fix-on-error, capped at 2 Coder attempts per step.
> 5. The merged guardrail+decision call happens after every non-final step only. The final step (cap reached) never calls it — that judgment moves into the existing Synthesizer prompt instead.
> 6. Hard step cap = 3. No config flag for this.
> 7. Reuse the existing SSE `progress_callback` mechanism for step-progress messages — do not add a new event type or frontend contract.
> 8. Chart payload construction uses only the final executed step's result.
> 9. On any step's Coder exhausting retries, stop the loop and pass partial results (if any) to the Synthesizer — do not build new error-handling paths beyond what `run_query` already does on failure today.
> 10. Implement every test case in §12 (T1–T14) of the attached spec. Do not summarize or partially implement this list — all 14 are mandatory acceptance criteria, not suggestions. T1 and T14 in particular must report actual measured LLM call counts, not estimates.
> 11. When reporting completion, you MUST use the exact report format in §13 of the attached spec — numeric results for every test (T1–T14), a deviations section, and an open issues section. A summary like "tests passed" or "implementation complete" with no numbers is not an acceptable report and will be rejected. If a test cannot be run (e.g. no suitable test data exists yet), state that explicitly rather than omitting the line or guessing a result.
>
> Confirm your understanding of constraints 1–9 before writing any code. Then implement `_run_step_loop()`, the Strategist schema change, and the Synthesizer prompt extension from §7. Do not modify `chat_routes.py`, `ai-prompt-box.tsx`, or any other file outside `executor.py` unless the SSE event payload shape genuinely requires a corresponding frontend field — if so, flag it explicitly rather than changing it silently.

---

**Open item requiring your confirmation before this is fully final:** §7's chart-payload assumption (last step only). Everything else in this document reflects decisions already locked in this conversation.
