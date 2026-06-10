import os
import sys
import time
import json
import math
import platform
import argparse
import asyncio
import tempfile
from datetime import datetime, date
from pathlib import Path
import numpy as np
import pandas as pd
import duckdb
import psutil

# Add backend directory to path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

# Import query cache
try:
    from app.services.analytics.query_cache import get_cached, set_cached, clear_cache
except ImportError:
    # Fallback in case of module structure issues
    _cache = {}
    def get_cached(key): return _cache.get(key)
    def set_cached(key, val): _cache[key] = val
    def clear_cache(): _cache.clear()

try:
    from app.services.ingestion_execution.file_loader import _read_csv_with_encodings
except ImportError:
    # Fallback simulation of coding check
    def _read_csv_with_encodings(source, **kwargs):
        last_error = None
        for encoding in ["utf-8", "utf-8-sig", "latin-1", "cp1252", "iso-8859-1"]:
            try:
                if hasattr(source, "seek"):
                    source.seek(0)
                return pd.read_csv(source, encoding=encoding, low_memory=False, **kwargs)
            except UnicodeDecodeError:
                last_error = f"Encoding {encoding} failed"
                continue
        raise ValueError(f"Failed to parse CSV file: {last_error}")


def get_system_info():
    """Gathers system specs."""
    try:
        cpu_model = platform.processor() or "Unknown"
        ram_gb = round(psutil.virtual_memory().total / (1024**3), 2)
    except Exception:
        cpu_model = "Unknown"
        ram_gb = 0
    return {
        "cpu": cpu_model,
        "ram_gb": ram_gb,
        "python_version": platform.python_version()
    }


def generate_synthetic_data(num_rows):
    """Generates the synthetic dataset for query tests."""
    np.random.seed(42)
    
    categories_a = [f"CatA_{i}" for i in range(10)]
    categories_b = [f"CatB_{i}" for i in range(5)]
    categories_c = [f"CatC_{i}" for i in range(20)]
    
    dates = pd.date_range(start="2025-01-01", periods=100).strftime("%Y-%m-%d").tolist()
    
    data = {
        "dim_a": np.random.choice(categories_a, num_rows),
        "dim_b": np.random.choice(categories_b, num_rows),
        "dim_c": np.random.choice(categories_c, num_rows),
        "metric_a": np.random.uniform(1.0, 100.0, num_rows),
        "metric_b": np.random.uniform(10.0, 500.0, num_rows),
        "metric_c": np.random.uniform(0.1, 1.0, num_rows),
        "date_col": np.random.choice(dates, num_rows),
    }
    
    return pd.DataFrame(data)


def run_duckdb_latency(conn, iterations):
    """BENCHMARK 1: DuckDB Query Latency"""
    print("\n--- Running Benchmark 1: DuckDB Query Latency (1M rows) ---")
    
    queries = {
        "simple_filter": "SELECT * FROM dataset WHERE dim_a = 'CatA_3' LIMIT 100",
        "group_by_single": "SELECT dim_b, SUM(metric_b) FROM dataset GROUP BY dim_b",
        "group_by_multi": "SELECT dim_a, dim_b, SUM(metric_a), AVG(metric_b), COUNT(metric_c) FROM dataset GROUP BY dim_a, dim_b",
        "order_limit": "SELECT * FROM dataset ORDER BY metric_c DESC LIMIT 100",
        "complex_query": "SELECT dim_c, SUM(metric_a) FROM dataset WHERE metric_b > 100.0 AND dim_a IN ('CatA_1', 'CatA_2') GROUP BY dim_c ORDER BY SUM(metric_a) DESC"
    }
    
    results = {}
    
    for name, sql in queries.items():
        latencies = []
        # Warm-up run
        conn.execute(sql).fetchall()
        
        for _ in range(iterations):
            t0 = time.perf_counter()
            conn.execute(sql).fetchall()
            t1 = time.perf_counter()
            latencies.append((t1 - t0) * 1000.0) # ms
            
        p50 = np.percentile(latencies, 50)
        p95 = np.percentile(latencies, 95)
        p99 = np.percentile(latencies, 99)
        max_val = np.max(latencies)
        
        results[name] = {
            "p50": round(p50, 2),
            "p95": round(p95, 2),
            "p99": round(p99, 2),
            "max": round(max_val, 2)
        }
        
        print(f"  {name:18s} | p50: {p50:6.2f}ms | p95: {p95:6.2f}ms | p99: {p99:6.2f}ms | max: {max_val:6.2f}ms")
        if p95 > 500.0:
            print(f"  [WARNING] p95 latency for {name} exceeded 500ms ({p95:.2f}ms)")
            
    return results


def run_routing_crossover(iterations):
    """BENCHMARK 2: Pandas vs DuckDB Routing Crossover"""
    print("\n--- Running Benchmark 2: Pandas vs DuckDB Routing Crossover ---")
    row_counts = [1000, 10000, 50000, 100000, 250000, 500000, 1000000]
    data_points = []
    
    crossover_row_count = None
    
    for count in row_counts:
        # Generate smaller dataset
        df_sub = generate_synthetic_data(count)
        
        # Setup DuckDB database for this count
        db_sub = duckdb.connect(database=":memory:")
        db_sub.execute("CREATE TABLE dataset AS SELECT * FROM df_sub")
        
        # SQL/Pandas equivalent operation
        sql = "SELECT dim_b, SUM(metric_b) FROM dataset GROUP BY dim_b"
        
        # DuckDB timing
        duckdb_times = []
        for _ in range(iterations):
            t0 = time.perf_counter()
            db_sub.execute(sql).fetchall()
            t1 = time.perf_counter()
            duckdb_times.append((t1 - t0) * 1000.0)
        duck_ms = np.mean(duckdb_times)
        
        # Pandas timing
        pandas_times = []
        for _ in range(iterations):
            t0 = time.perf_counter()
            df_sub.groupby("dim_b")["metric_b"].sum()
            t1 = time.perf_counter()
            pandas_times.append((t1 - t0) * 1000.0)
        pan_ms = np.mean(pandas_times)
        
        # Faster engine and multiplier
        if duck_ms < pan_ms:
            faster = "duckdb"
            mult = pan_ms / duck_ms
        else:
            faster = "pandas"
            mult = duck_ms / pan_ms
            
        data_points.append({
            "rows": count,
            "duckdb_ms": round(duck_ms, 3),
            "pandas_ms": round(pan_ms, 3),
            "faster_engine": faster,
            "multiplier": round(mult, 2)
        })
        
        print(f"  Rows: {count:7d} | DuckDB: {duck_ms:6.2f}ms | Pandas: {pan_ms:6.2f}ms | Faster: {faster:6s} ({mult:.2f}x)")
        
    # Identify consistent crossover point (where DuckDB is faster for this and all larger row counts)
    crossover_row_count = None
    for i in range(len(data_points)):
        if all(dp["faster_engine"] == "duckdb" for dp in data_points[i:]):
            crossover_row_count = data_points[i]["rows"]
            break
            
    # Default crossover if not reached
    if crossover_row_count is None:
        crossover_row_count = -1
        
    print(f"  Estimated Crossover Threshold Row Count: {crossover_row_count}")
    return {
        "crossover_row_count": crossover_row_count,
        "data_points": data_points
    }


def run_cache_performance(conn):
    """BENCHMARK 3: Cache Performance"""
    print("\n--- Running Benchmark 3: Cache Performance ---")
    
    # Complex query
    sql = "SELECT dim_a, dim_b, SUM(metric_a), AVG(metric_b), COUNT(metric_c) FROM dataset GROUP BY dim_a, dim_b"
    cache_key = "benchmark_1m_complex_query"
    
    clear_cache()
    
    # Cold execution
    t0 = time.perf_counter()
    res = conn.execute(sql).fetchall()
    set_cached(cache_key, res)
    t1 = time.perf_counter()
    cold_ms = (t1 - t0) * 1000.0
    
    # Warm execution
    t0 = time.perf_counter()
    cached_res = get_cached(cache_key)
    t1 = time.perf_counter()
    warm_ms = (t1 - t0) * 1000.0
    
    # Assert correctness
    assert len(res) == len(cached_res), "Cached results mismatch!"
    
    # Protect against sub-millisecond precision limits
    if warm_ms < 0.01:
        warm_ms = 0.01
        
    speedup = cold_ms / warm_ms
    saved = cold_ms - warm_ms
    
    print(f"  Cold Cache: {cold_ms:.2f}ms")
    print(f"  Warm Cache: {warm_ms:.2f}ms")
    print(f"  Speedup Multiplier: {speedup:.2f}x")
    print(f"  Time Saved: {saved:.2f}ms")
    
    return {
        "cold_ms": round(cold_ms, 2),
        "warm_ms": round(warm_ms, 2),
        "speedup_multiplier": round(speedup, 2),
        "time_saved_ms": round(saved, 2)
    }


def run_ingestion_performance(is_quick):
    """BENCHMARK 4: File Ingestion Performance"""
    print("\n--- Running Benchmark 4: File Ingestion Performance ---")
    sizes_mb = [10, 25, 50, 100]
    if is_quick:
        sizes_mb = [10, 25] # Skip 50 and 100 in quick mode
        print("  [Quick Mode] Testing 10MB and 25MB files only.")
        
    results = {}
    
    for mb in sizes_mb:
        print(f"  Processing {mb}MB file...")
        # Create temp files
        with tempfile.TemporaryDirectory() as tmpdir:
            clean_path = Path(tmpdir) / f"clean_{mb}mb.csv"
            fallback_path = Path(tmpdir) / f"fallback_{mb}mb.csv"
            
            # Generate synthetic data size estimate
            # Approx 75 bytes per row
            num_rows = int((mb * 1024 * 1024) / 75)
            df = generate_synthetic_data(num_rows)
            
            # Write UTF-8 Clean CSV
            df.to_csv(clean_path, index=False, encoding="utf-8")
            
            # Create a latin-1 dataset with special characters
            df_fallback = df.copy()
            df_fallback.iloc[0, 0] = "Café_latin1_ñ_ü_é"
            # Write with latin-1
            df_fallback.to_csv(fallback_path, index=False, encoding="latin-1")
            
            # Measure UTF-8 Clean path
            t0 = time.perf_counter()
            res_clean = _read_csv_with_encodings(clean_path)
            t1 = time.perf_counter()
            clean_ms = (t1 - t0) * 1000.0
            
            # Measure Encoding Fallback path
            t0 = time.perf_counter()
            res_fallback = _read_csv_with_encodings(fallback_path)
            t1 = time.perf_counter()
            fallback_ms = (t1 - t0) * 1000.0
            
            total_ingestion_ms = clean_ms # Under standard path
            rows_per_sec = int(len(df) / (clean_ms / 1000.0)) if clean_ms > 0 else 0
            
            results[f"{mb}mb"] = {
                "total_ingestion_time_ms": round(total_ingestion_ms, 2),
                "utf8_clean_path_time_ms": round(clean_ms, 2),
                "encoding_fallback_path_time_ms": round(fallback_ms, 2),
                "rows_processed_per_second": rows_per_sec
            }
            
            print(f"    Clean UTF-8: {clean_ms:6.2f}ms | Fallback Latin-1: {fallback_ms:6.2f}ms | {rows_per_sec:,} rows/sec")
            
    return results


async def run_streaming_throughput():
    """BENCHMARK 5: SSE Streaming Slot Throughput"""
    print("\n--- Running Benchmark 5: SSE Streaming Slot Throughput ---")
    
    # Setup data
    df_sub = generate_synthetic_data(500000)
    db = duckdb.connect(database=":memory:")
    db.execute("CREATE TABLE dataset AS SELECT * FROM df_sub")
    
    # 5 slots/queries
    queries = [
        "SELECT dim_a, SUM(metric_a) FROM dataset GROUP BY dim_a",
        "SELECT dim_b, AVG(metric_b) FROM dataset GROUP BY dim_b",
        "SELECT dim_c, COUNT(*) FROM dataset GROUP BY dim_c",
        "SELECT date_col, SUM(metric_c) FROM dataset GROUP BY date_col",
        "SELECT dim_a, dim_b, SUM(metric_a) FROM dataset GROUP BY dim_a, dim_b"
    ]
    
    completed_times = []
    start_time = time.perf_counter()
    
    def run_query_on_cursor(cursor, sql):
        return cursor.execute(sql).fetchall()
        
    async def run_slot(idx, sql):
        # Create a thread-safe cursor copy for the concurrent slot execution
        cur = db.cursor()
        t0 = time.perf_counter()
        
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, run_query_on_cursor, cur, sql)
        
        t1 = time.perf_counter()
        cur.close()
        finish_offset = (t1 - start_time) * 1000.0
        completed_times.append(finish_offset)
        return finish_offset

    tasks = [run_slot(i, q) for i, q in enumerate(queries)]
    await asyncio.gather(*tasks)
    
    completed_times.sort()
    time_to_first = completed_times[0]
    time_to_all = completed_times[-1]
    
    # Determine sequential vs concurrent based on offsets
    # If concurrent, the gap between first and last complete will be small relative to sequential sum
    # Let's write the results
    print(f"  Time to first result: {time_to_first:.2f}ms")
    print(f"  Time to all complete: {time_to_all:.2f}ms")
    
    return {
        "time_to_first_result_ms": round(time_to_first, 2),
        "time_to_all_complete_ms": round(time_to_all, 2)
    }


async def main():
    parser = argparse.ArgumentParser(description="Vizzy Analytics Benchmark")
    parser.add_argument("--quick", action="store_true", help="Run quick testing with 5 iterations instead of 30")
    args = parser.parse_args()
    
    iterations = 5 if args.quick else 30
    print(f"Starting Benchmark Suite (Quick={args.quick}, Iterations={iterations})")
    
    # Setup 1M row main connection
    print("Generating 1M row synthetic dataset...")
    t0 = time.perf_counter()
    df_1m = generate_synthetic_data(1000000)
    print(f"Dataset generated in {time.perf_counter() - t0:.2f}s")
    
    conn = duckdb.connect(database=":memory:")
    conn.execute("CREATE TABLE dataset AS SELECT * FROM df_1m")
    
    # Run Benchmarks
    b1_results = run_duckdb_latency(conn, iterations)
    b2_results = run_routing_crossover(iterations)
    b3_results = run_cache_performance(conn)
    b4_results = run_ingestion_performance(args.quick)
    b5_results = await run_streaming_throughput()
    
    # Build output json
    results = {
        "timestamp": datetime.now().isoformat(),
        "system": get_system_info(),
        "duckdb_latency": {
            "1M_rows": b1_results
        },
        "routing_crossover": b2_results,
        "cache_performance": b3_results,
        "ingestion_performance": b4_results,
        "streaming_throughput": b5_results
    }
    
    # Save output to file
    out_path = Path(backend_dir) / "benchmarks" / "results.json"
    out_path.parent.mkdir(exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(results, f, indent=2)
        
    print(f"\nBenchmarks completed successfully. Results saved to {out_path}")


if __name__ == "__main__":
    asyncio.run(main())
