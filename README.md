<div align="center">

<h1>⚡ Vizzy Analytics</h1>

<p><strong>Natural language to validated SQL. Hybrid execution engine. Immutable audit trail.</strong><br>
Ask your data a question. Get a chart. Every transformation tracked.</p>

<p>
  <img src="https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square" alt="License"/>
  <img src="https://img.shields.io/badge/Live%20Demo-Online-brightgreen?style=flat-square&logo=vercel&logoColor=white" alt="Live Demo"/>
  <img src="https://img.shields.io/github/last-commit/JAMIEL-J/Vizzy-Analytics?style=flat-square&logo=github" alt="Last Commit"/>
  <img src="https://img.shields.io/github/repo-size/JAMIEL-J/Vizzy-Analytics?style=flat-square" alt="Repo Size"/>
</p>

<p>
  <img src="https://img.shields.io/badge/Python-3.10%2B-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python"/>
  <img src="https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white" alt="FastAPI"/>
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React"/>
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/DuckDB-FFF000?style=flat-square&logo=duckdb&logoColor=black" alt="DuckDB"/>
  <img src="https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind CSS"/>
  <img src="https://img.shields.io/badge/Deployed%20on-Vercel-000000?style=flat-square&logo=vercel&logoColor=white" alt="Vercel"/>
</p>

<p>
  <a href="https://vizzy-ai-dqgw.vercel.app">🚀 Live Demo</a> &nbsp;·&nbsp;
  <a href="https://github.com/JAMIEL-J/Vizzy-Analytics">📂 GitHub</a> &nbsp;·&nbsp;
  <a href="#%EF%B8%8F-how-it-works">⚙️ How It Works</a> &nbsp;·&nbsp;
  <a href="#-performance-numbers">🔖 Benchmarks</a>
</p>

</div>

---

## The Problem

Data teams face a severe workflow bottleneck when non-technical stakeholders require custom aggregations or transformations, forcing analysts to manually write and debug SQL. When transformations are performed ad-hoc without structured tracking, data trust degrades as there is no record of how metrics were generated. Furthermore, when underlying database schemas change or files are re-uploaded, existing static dashboards break, leading to silent reporting errors and outdated visualizations.

## What Vizzy Does

Vizzy translates natural language queries into validated database operations, executing them against a versioned dataset while preserving a full audit trail of every transformation. It establishes an immutable lineage of data states by generating verifiable cleaning plans and re-mapping rules whenever dataset schemas or column mappings change. Stakeholders interact with auto-generated charts that immediately recalculate during client-side filter changes without corrupting the underlying dataset.

---

## 📊 Performance Numbers

> Benchmarked on: Intel i-series · 7.75GB RAM · Python 3.14 · [`run_benchmarks.py`](backend/benchmarks/run_benchmarks.py)

On this configuration the analytics engine achieves under 65ms p95 across all query types on a 1M row dataset, rendering a simple filter at p95 of 2.77ms and a complex multi-aggregation at p95 of 55ms. Query routing depends on dataset size: pandas is up to 2.24x faster below 100K rows, whereas DuckDB takes over at 100K rows and executes 3.34x faster than pandas at 1M rows. Caching reduces query latency from a cold state of ~27ms to under 1ms on warm hits. File ingestion processes a 10MB CSV in 371ms at 377K rows/second, scaling to 2.3 seconds for a 100MB CSV at 610K rows/second, with non-UTF-8 encoding fallbacks introducing ~70% execution overhead. Concurrent dashboard loading displays the first chart in 55ms, with all 5 slots completing in 67ms.

| Metric | Value |
|:---|:---|
| Simple filter · 1M rows | **2.77ms p95** |
| Complex multi-aggregation · 1M rows | **55ms p95** |
| DuckDB vs Pandas at 1M rows | **3.34x faster** |
| Routing crossover point | **~100K rows** |
| Cache cold → warm | **~27ms → <1ms** |
| Time to first chart (SSE) | **55ms** |
| All 5 dashboard slots complete | **67ms** |
| 100MB CSV ingestion | **2.3s · 610K rows/sec** |

**Bar = DuckDB execution time (ms) &nbsp;|&nbsp; Line = Pandas execution time (ms)**

```mermaid
xychart-beta
    title "DuckDB vs Pandas — Execution Time by Row Count"
    x-axis ["1K", "10K", "50K", "100K", "250K", "500K", "1M"]
    y-axis "Execution Time (ms)"
    bar [4.16, 5.11, 7.25, 10.20, 12.90, 16.80, 26.70]
    line [1.86, 2.28, 6.26, 10.50, 23.90, 44.70, 89.30]
```

> Pandas is faster below 100K rows. DuckDB scales efficiently, becoming 3.34x faster at 1M rows.

---

## ⚙️ How It Works

The request lifecycle begins when the user enters a natural language query in the React interface (`ChatInterface.tsx`). The frontend sends this query to the FastAPI backend (`POST /api/v1/chat`), where it is parsed by the LLM routing service (`app/services/llm/llm_router.py`). The router coordinates either a Groq or Gemini model to generate a valid SQL query based on constraints in `config.py` (timeout: 30 seconds, maximum token budget: 512). The generated SQL passes through SQLGlot validation guardrails to prevent injection or invalid syntax before proceeding.

Once validated, the query router (`app/services/analytics/execution_router.py`) evaluates execution size. For datasets under 100K rows, it routes to `pandas_pipeline.py` because pandas is up to 2.24x faster at small scale. For 100K rows or more, it routes to `duckdb_pipeline.py`, scaling to 3.34x faster than pandas at 1M rows. Before executing, the router checks the query cache (`app/services/analytics/query_cache.py`) using a cache key structured as `f"{dataset_id}:{version_id}:{chart_id}:{filters_json}"`. Cold cache executes in ~27ms; warm hits resolve under 1ms.

```mermaid
flowchart TD
    Q([Incoming Natural Language Query]) --> C{Cache Hit?}
    C -- Yes --> R([Return Cached Result — under 1ms])
    C -- No --> S{Row Count}
    S -- Less than 100K rows --> P([Pandas Pipeline\nup to 2.24x faster at small scale])
    S -- 100K rows or more --> D([DuckDB Pipeline\n3.34x faster at 1M rows])
    P --> CS([Write to Cache])
    D --> CS
    CS --> SS([Stream via SSE to Client])
```

> Queries are cache-checked first, then routed by dataset size — minimising redundant database execution.

Results are yielded to the client via Server-Sent Events (`StreamingResponse` in `app/api/dashboard_load_routes.py`). The React hook `useDashboardStream` opens a persistent SSE connection (`GET /dashboard/load/{version_id}`), extracting token authorizations from query parameters since `EventSource` does not support custom headers. Streamed data updates the Zustand store (`useFilterStore`), which coordinates local filtering. Local filters apply directly to the in-memory sample (`rawData`), recalculating chart aggregates dynamically so that the database is not queried on simple filter changes.

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant React as React Frontend (ChatInterface)
    participant API as FastAPI Gateway
    participant LLM as LLM — Groq/Gemini Router
    participant Guard as SQL Guardrails (SQLGlot)
    participant Cache as query_cache.py
    participant DB as DuckDB / Pandas Pipeline
    participant SSE as SSE Stream (load_dashboard)

    User->>React: Enter query in natural language input field
    React->>API: POST /api/v1/chat — JWT Auth
    API->>LLM: Request SQL generation
    LLM-->>API: Raw SQL response
    API->>Guard: Validate SQL security and syntax
    Guard-->>API: Validated query
    API->>Cache: Check cache key
    alt Cache Hit
        Cache-->>API: Return results — under 1ms
    else Cache Miss
        API->>DB: Execute on slotted pipeline
        DB-->>API: Query results — approximately 27ms
        API->>Cache: Store result
    end
    API->>SSE: Stream event packets via GET /dashboard/load/{version_id}
    SSE-->>React: Yield JSON chunk — useDashboardStream hook
    React-->>User: Render updated ChartRenderer
```

> Server-side validation and cache-check run before results stream via EventSource to the client.

```mermaid
sequenceDiagram
    participant API as Streaming Response
    participant UI as Dashboard View

    Note over API: Concurrent Slot Processing Begins
    API->>UI: Stream Open — 0ms
    API->>UI: First Slot Result — simple_filter — 55ms
    Note over UI: First Chart Visible to User
    API->>UI: Final Slot Result — complex_query — 67ms
    Note over UI: All 5 Charts Complete
```

> All 5 dashboard slots execute concurrently. First chart visible in 55ms. Full dashboard complete in 67ms.

---

## 🧩 Feature Matrix

| Feature | What It Does | Measurable Behavior / Impact |
|:---|:---|:---|
| **Natural Language Querying** | Translates plain text to validated SQL using Groq or Gemini models. | A non-technical stakeholder retrieves a grouped KPI without writing or reviewing a single line of SQL. |
| **Hybrid Execution Routing** | Switches dynamically between Pandas and DuckDB based on a 100K row threshold. | Executes small datasets under 3ms (p95). Executes 1M-row datasets under 55ms (p95). |
| **Immutable Versioning** | Chains dataset changes using parent version IDs and approved semantic mapping states. | A cleaning operation applied at 2pm is fully reversible and auditable at 4pm with exact diff visibility. |
| **SSE Streaming** | Broadcasts dashboard slot results as each execution slot completes. | First chart visible in 55ms. Full 5-chart dashboard resolves in 67ms. |
| **Data Profiling & Schema Inference** | Evaluates data types, unique values, and cardinality ratios from a 50-row sample. | Identifies semantic column roles and blocks false positives like "percentage" or "usage" from misclassification. |
| **Data Cleaning Pipeline** | Performs outlier capping, string trimming, missing value interpolation, and duplicate removal. | Resolves NaT errors and scales parsing to 610K rows/sec on clean UTF-8 ingestion. |

```mermaid
flowchart TD
    O([Original Dataset Version]) --> C([Create Cleaning Plan])
    C --> P([proposed_actions JSON])
    P --> A{Approval Gate\napproved_by and approved_at}
    A -- Approved --> E([execute_cleaning])
    E --> V([New Immutable DatasetVersion\nparent_version_id assigned])
    V --> L([Log AuditEvent\nFILE_INGESTED / DATASET_CREATED])
    V --> R([Rollback Path\nvia parent_version_id])
```

> Versions chain through `parent_version_id` — every cleaning operation is reversible with full diff visibility at any point.

---

## 🏗️ Architecture

```mermaid
graph TD
    classDef frontend fill:transparent,stroke:#01579b,stroke-width:2px;
    classDef api fill:transparent,stroke:#2e7d32,stroke-width:2px;
    classDef service fill:transparent,stroke:#ef6c00,stroke-width:2px;
    classDef engine fill:transparent,stroke:#7b1fa2,stroke-width:2px;
    classDef storage fill:transparent,stroke:#455a64,stroke-width:2px;
    classDef ext fill:transparent,stroke:#333,stroke-dasharray: 5 5;

    subgraph Client ["Frontend — React / Vite"]
        UI[User Interface]:::frontend
        ConnectDB[Connect Database]:::frontend
        CleaningStudio[Cleaning Studio]:::frontend
        Dashboard[Dashboard View]:::frontend
        Chat[Chat Interface]:::frontend
    end

    subgraph API ["FastAPI API Gateway"]
        AuthAPI[Auth Routes]:::api
        UploadAPI[Upload Routes]:::api
        InspectAPI[Inspection Routes]:::api
        CleanAPI[Cleaning Routes]:::api
        AnalysisAPI[Analysis Routes]:::api
    end

    subgraph Services ["Business Services Layer"]
        AuthSvc[Auth Service]:::service
        DatasetSvc[Dataset Service]:::service
        InspectSvc[Inspection Service]:::service
        CleanSvc[Cleaning Service]:::service
        AnalysisOrch[Analysis Orchestrator]:::service
    end

    subgraph Engines ["Slotted Execution Pipelines"]
        IngestEng[Ingestion Engine]:::engine
        InspectEng[Inspection Engine]:::engine
        CleanEng[Cleaning Engine]:::engine

        subgraph NLP_Pipeline ["LLM / NLP Pipeline"]
            IntentClass[Intent Classifier]:::engine
            IntentValid[Intent Validator]:::engine
            ChartRec[Chart Recommender]:::engine
            TextGen[Text Answer Generator]:::engine
        end

        AnalysisExec[Analysis Executor]:::engine
    end

    subgraph Infrastructure ["Persistent Storage and LLM APIs"]
        DB[(PostgreSQL / SQLite)]:::storage
        FS[File System — Parquet / CSV]:::storage
        LLM[LLM Provider — Gemini / Groq]:::ext
    end

    UI --> AuthAPI
    ConnectDB --> UploadAPI
    CleaningStudio --> CleanAPI
    CleaningStudio --> InspectAPI
    Dashboard --> AnalysisAPI
    Chat --> AnalysisAPI

    AuthAPI --> AuthSvc
    UploadAPI --> DatasetSvc
    InspectAPI --> InspectSvc
    CleanAPI --> CleanSvc
    AnalysisAPI --> AnalysisOrch

    DatasetSvc --> IngestEng
    IngestEng --> FS
    IngestEng --> DB

    InspectSvc --> InspectEng
    InspectEng --> FS
    InspectEng --> DB

    CleanSvc --> CleanEng
    CleanEng --> FS
    CleanEng --> DB

    AnalysisOrch --> IntentClass
    IntentClass --> LLM
    IntentClass --> IntentValid
    IntentValid --> AnalysisExec
    AnalysisExec --> FS
    AnalysisExec --> AnalysisOrch

    AnalysisOrch --> ChartRec
    ChartRec --> AnalysisOrch

    AnalysisOrch --> TextGen
    TextGen --> LLM
    TextGen --> AnalysisOrch

    AnalysisOrch --> AnalysisAPI
```

> Each UI page routes through a dedicated FastAPI handler → service → execution engine → storage. No cross-layer shortcuts.

---

## 🚀 Getting Started

**Prerequisites:** Python 3.10+ · Node.js 18+ · Groq or Gemini API key

**Backend**

```bash
cd backend
cp .env.example .env
pip install -r requirements.txt
uvicorn app.main:app --reload
```

API at `http://localhost:8000` · Docs at `http://localhost:8000/docs`

**Frontend**

```bash
cd frontend
npm install
npm run dev
```

App at `http://localhost:5173`

**Benchmarks**

```bash
python backend/benchmarks/run_benchmarks.py
# --quick flag for 5-iteration rapid run
```

Results saved to `backend/benchmarks/results.json`

---

## 🛠️ Tech Stack

<div align="center">
  <img src="https://skillicons.dev/icons?i=react,ts,vite,tailwind,py,fastapi" />
</div>

<br>

| Layer | Technologies |
|:---|:---|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS, Zustand, Chart.js (react-chartjs-2) |
| **Backend** | Python 3.10+, FastAPI, SQLModel, Python-jose |
| **Execution** | DuckDB, Pandas, SQLGlot |
| **LLM** | Groq API, Gemini API |
| **Deployment** | Vercel (frontend), Uvicorn (backend) |

---

<div align="center">
  <a href="https://vizzy-ai-dqgw.vercel.app">
    <img src="https://img.shields.io/badge/Try%20it%20Live-vizzy--ai--dqgw.vercel.app-brightgreen?style=for-the-badge&logo=vercel&logoColor=white" alt="Live Demo"/>
  </a>
  <br><br>
  <sub>Benchmarked on Intel i-series · 7.75GB RAM · Python 3.14 · All numbers reproducible via <code>run_benchmarks.py</code></sub>
</div>