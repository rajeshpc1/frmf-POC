import pandas as pd

# Load both results
original = pd.read_parquet('original-result.parquet')
duplicate = pd.read_parquet('duplicate-result.parquet')

print('=== FRMF DUPLICATE DETECTION TEST ===')
print(f'Original ID: {original["id"].iloc[0]}')
print(f'Duplicate ID: {duplicate["id"].iloc[0]}')
print()
print('ORIGINAL REQUEST:')
print(f'  Is Duplicate: {original["is_duplicate"].iloc[0]}')
print(f'  Confidence: {original["duplicate_confidence"].iloc[0]}')
print(f'  AI Effort: {original["ai_effort"].iloc[0]} days')
print()
print('DUPLICATE REQUEST:')
print(f'  Is Duplicate: {duplicate["is_duplicate"].iloc[0]}')
print(f'  Confidence: {duplicate["duplicate_confidence"].iloc[0]}')
print(f'  AI Effort: {duplicate["ai_effort"].iloc[0]} days')
if 'similar_request_id' in duplicate.columns:
    print(f'  Similar Request ID: {duplicate["similar_request_id"].iloc[0]}')
print()
if duplicate["is_duplicate"].iloc[0]:
    print('✅ SUCCESS: Duplicate detection working!')
else:
    print('❌ ISSUE: Duplicate not detected')