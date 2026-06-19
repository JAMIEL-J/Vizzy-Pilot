import re

file_path = "backend/app/services/analytics/db_engine.py"
with open(file_path, "r") as f:
    content = f.read()

# Replace self._write_con.register(f"_tmp_{table_name}", df)
# with:
#        # Convert string columns to object before registering for duckdb
#        df_reg = df.copy()
#        for col in df_reg.select_dtypes(include=['string']):
#            df_reg[col] = df_reg[col].astype(object)
#        self._write_con.register(f"_tmp_{table_name}", df_reg)

new_code = """
            try:
                self._write_con.unregister(f"_tmp_{table_name}")
            except Exception:
                pass

            # Pandas 3 + DuckDB < 1.0 workaround
            df_reg = df.copy()
            for col in df_reg.select_dtypes(include=['string']).columns:
                df_reg[col] = df_reg[col].astype('object')

            self._write_con.register(f"_tmp_{table_name}", df_reg)
"""

content = content.replace(
    '            try:\n                self._write_con.unregister(f"_tmp_{table_name}")\n            except Exception:\n                pass\n\n            self._write_con.register(f"_tmp_{table_name}", df)',
    new_code
)

with open(file_path, "w") as f:
    f.write(content)
