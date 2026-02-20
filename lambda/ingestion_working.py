import json
import boto3
import uuid
from datetime import datetime
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

s3 = boto3.client('s3')

def handler(event, context):
    """Streamlined ingestion - stores to S3 and triggers processing via S3 events"""
    cors_headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent',
        'Access-Control-Allow-Methods': 'OPTIONS,GET,PUT,POST,DELETE,PATCH,HEAD'
    }
    
    try:
        # Handle CORS preflight
        if event.get('httpMethod') == 'OPTIONS':
            return {
                'statusCode': 200,
                'headers': cors_headers,
                'body': ''
            }
        
        # Parse incoming data
        body = json.loads(event.get('body', '{}'))
        
        # Add metadata
        record = {
            'id': str(uuid.uuid4()),
            'timestamp': datetime.utcnow().isoformat(),
            'ingestion_source': 'api_gateway',
            'feature_request': body
        }
        
        # Store in raw bucket (S3 event will trigger processing)
        key = f"year={datetime.now().year}/month={datetime.now().month:02d}/day={datetime.now().day:02d}/{record['id']}.json"
        
        s3.put_object(
            Bucket='bt101-raw-data-alpha-012258635969',
            Key=key,
            Body=json.dumps(record),
            ContentType='application/json'
        )
        
        logger.info(f"Ingested: {record['id']} -> s3://bt101-raw-data-alpha-012258635969/{key}")
        
        return {
            'statusCode': 200,
            'headers': cors_headers,
            'body': json.dumps({
                'message': 'Data ingested successfully',
                'id': record['id'],
                'processing': 'triggered_via_s3_event'
            })
        }
        
    except Exception as e:
        logger.error(f"Ingestion error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': cors_headers,
            'body': json.dumps({'error': str(e)})
        }