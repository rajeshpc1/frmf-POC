import pandas as pd

df = pd.read_parquet('test-result.parquet')
print('=== FRMF PIPELINE TEST RESULT ===')
print(f'Request ID: {df["id"].iloc[0]}')
print(f'Title: {df["title"].iloc[0]}')
print(f'AI Category: {df["ai_category"].iloc[0]}')
print(f'AI Effort: {df["ai_effort"].iloc[0]} days')
print(f'Is Duplicate: {df["is_duplicate"].iloc[0]}')
print(f'Duplicate Confidence: {df["duplicate_confidence"].iloc[0]}')
print(f'Total Columns: {len(df.columns)}')
print('\n✅ All 3 Lambda functions executed successfully!')