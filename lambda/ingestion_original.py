import json
import boto3
import uuid
from datetime import datetime

s3 = boto3.client('s3')

def handler(event, context):
    try:
        # Parse the incoming request
        body = json.loads(event['body']) if isinstance(event.get('body'), str) else event.get('body', {})
        
        # Generate unique ID and timestamp
        request_id = str(uuid.uuid4())
        timestamp = datetime.utcnow().isoformat() + 'Z'
        
        # Create request data
        request_data = {
            'id': request_id,
            'timestamp': timestamp,
            'ingestion_source': 'api_gateway',
            'feature_request': body
        }
        
        # Store in S3
        bucket = 'bt101-raw-data-alpha-012258635969'
        today = datetime.utcnow()
        key = f'year={today.year}/month={today.month:02d}/day={today.day:02d}/{request_id}.json'
        
        s3.put_object(
            Bucket=bucket,
            Key=key,
            Body=json.dumps(request_data),
            ContentType='application/json'
        )
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({
                'message': 'Feature Request Submitted Successfully!',
                'request_id': request_id,
                'status': 'Your request has been submitted and will be processed by our AI system for classification and forecasting.',
                'next_steps': 'You will receive AI-generated analysis including implementation timeline estimates within 5 minutes. Check the "Track My Requests" tab to view updates.'
            })
        }
        
    except Exception as e:
        return {
            'statusCode': 500,
            'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({'error': 'Internal server error'})
        }
