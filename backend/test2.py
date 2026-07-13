import sqlite3
import pandas as pd

conn = sqlite3.connect('vizzy.db')
c = conn.cursor()
c.execute("SELECT id, file_path FROM datasets WHERE name LIKE '%superstore%'")
res = c.fetchone()
if res:
    print('Found dataset:', res)
    df = pd.read_csv(res[1])
    print('Cols:', list(df.columns))
else:
    print('No dataset')
