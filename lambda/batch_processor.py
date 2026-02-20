import json
import boto3
from datetime import datetime, timedelta

s3 = boto3.client('s3')
lambda_client = boto3.client('lambda')

def handler(event, context):
    """Batch process unprocessed JSON files every 5 minutes"""
    
    raw_bucket = 'bt101-raw-data-alpha-012258635969'
    processed_bucket = 'bt101-parquet-data-alpha-012258635969'
    
    try:
        # Get all JSON files from today
        today = datetime.now()
        prefix = f'year={today.year}/month={today.month:02d}/day={today.day:02d}/'
        
        response = s3.list_objects_v2(
            Bucket=raw_bucket,
            Prefix=prefix
        )
        
        processed_count = 0
        
        if 'Contents' in response:
            print(f"Found {len(response['Contents'])} objects in bucket")
            for obj in response['Contents']:
                key = obj['Key']
                print(f"Checking file: {key}")
                
                # Skip if not JSON
                if not key.endswith('.json'):
                    print(f"Skipping non-JSON file: {key}")
                    continue
                
                # Check if already processed
                parquet_key = key.replace('.json', '.parquet')
                try:
                    s3.head_object(Bucket=processed_bucket, Key=parquet_key)
                    print(f"Already processed: {key}")
                    continue  # Already processed
                except Exception:
                    print(f"Not processed yet: {key}")
                    pass  # Not processed yet
                
                # Process this file
                try:
                    lambda_client.invoke(
                        FunctionName='bt101-processing-alpha',
                        InvocationType='Event',  # Async
                        Payload=json.dumps({
                            'Records': [{
                                's3': {
                                    'bucket': {'name': raw_bucket},
                                    'object': {'key': key}
                                }
                            }]
                        })
                    )
                    processed_count += 1
                    print(f"Triggered processing for: {key}")
                    
                except Exception as e:
                    print(f"Failed to process {key}: {e}")
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': f'Batch processing complete. Processed {processed_count} files.',
                'processed_count': processed_count
            })
        }
        
    except Exception as e:
        print(f"Batch processing error: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }