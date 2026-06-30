import time
import duckdb
from app.services.analytics.join_manager import JoinManager

def run_benchmark():
    conn = duckdb.connect()

    # Create some dummy tables
    conn.execute("CREATE TABLE users (id INTEGER, name VARCHAR, created_at TIMESTAMP)")
    conn.execute("CREATE TABLE orders (id INTEGER, user_id INTEGER, amount DOUBLE, status VARCHAR)")
    conn.execute("CREATE TABLE order_items (id INTEGER, order_id INTEGER, product_id INTEGER, price DOUBLE)")
    conn.execute("CREATE TABLE products (id INTEGER, name VARCHAR, category VARCHAR)")

    # Create a large list of joins
    joins = []
    # simulate many column mappings to trigger the N+1 query issue
    for _ in range(100):
        joins.append({
            "left_table": "users",
            "right_table": "orders",
            "join_type": "LEFT",
            "columns": [{"left_column": "id", "right_column": "user_id"}] * 10
        })
        joins.append({
            "left_table": "orders",
            "right_table": "order_items",
            "join_type": "LEFT",
            "columns": [{"left_column": "id", "right_column": "order_id"}] * 10
        })
        joins.append({
            "left_table": "order_items",
            "right_table": "products",
            "join_type": "LEFT",
            "columns": [{"left_column": "product_id", "right_column": "id"}] * 10
        })

    start_time = time.time()
    result = JoinManager.validate_join_config(conn, joins)
    end_time = time.time()

    print(f"Validation took {end_time - start_time:.4f} seconds")
    print(f"Is valid: {result['is_valid']}")

if __name__ == '__main__':
    run_benchmark()
