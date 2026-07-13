import sqlite3
import os

db_path = 'data/vizzy.db'
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    c.execute("DELETE FROM dashboards")
    conn.commit()
    print('Cleared ALL dashboard caches!')
else:
    print('DB not found at data/vizzy.db')
