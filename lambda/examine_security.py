import pandas as pd

df = pd.read_parquet('security-result.parquet')
print('=== SECURITY REQUEST FINAL RESULT ===')
print(f'Request ID: {df["id"].iloc[0]}')
print(f'Title: {df["title"].iloc[0]}')
print(f'AI Category: {df["ai_category"].iloc[0]}')
print(f'AI Priority: {df["ai_priority"].iloc[0]}')
print(f'AI Effort: {df["ai_effort"].iloc[0]} days')
print(f'Service Team: {df["service_team"].iloc[0]}')
print(f'Is Duplicate: {df["is_duplicate"].iloc[0]}')
print(f'Total Columns: {len(df.columns)}')
print('\n✅ FRMF System Demo Ready!')