import pandas as pd

df = pd.read_parquet('security-result.parquet')
print('=== ALL COLUMNS AND VALUES ===')
print(f'Total Columns: {len(df.columns)}')
print('\nColumn Names:')
for i, col in enumerate(df.columns):
    print(f'{i+1:2d}. {col}')

print('\n=== KEY VALUES ===')
for col in df.columns:
    value = df[col].iloc[0]
    if pd.notna(value) and str(value).strip():
        print(f'{col}: {value}')
    else:
        print(f'{col}: [EMPTY/NULL]')