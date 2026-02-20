import json
import boto3
import uuid
from datetime import datetime

s3 = boto3.client('s3')
sqs = boto3.client('sqs')

# SQS Queue URL
QUEUE_URL = "https://sqs.us-west-2.amazonaws.com/012258635969/bt101-frmf-processing-queue"

def handler(event, context):
    """Enhanced ingestion with SQS queue integration"""
    try:
        # Parse the incoming request
        body = json.loads(event['body']) if isinstance(event.get('body'), str) else event.get('body', {})
        
        # Generate unique ID and timestamp
        request_id = str(uuid.uuid4())
        timestamp = datetime.utcnow().isoformat() + 'Z'
        
        # Create enhanced request data
        request_data = {
            'id': request_id,
            'timestamp': timestamp,
            'ingestion_source': 'api_gateway',
            'feature_request': body
        }
        
        # Store in S3 (raw data lake)
        bucket = 'bt101-raw-data-alpha-012258635969'
        today = datetime.utcnow()
        key = f'year={today.year}/month={today.month:02d}/day={today.day:02d}/{request_id}.json'
        
        s3.put_object(
            Bucket=bucket,
            Key=key,
            Body=json.dumps(request_data),
            ContentType='application/json'
        )
        
        # Send message to SQS queue for processing
        message = {
            'request_id': request_id,
            'bucket': bucket,
            'key': key,
            'timestamp': timestamp
        }
        
        sqs.send_message(
            QueueUrl=QUEUE_URL,
            MessageBody=json.dumps(message),
            MessageAttributes={
                'RequestType': {
                    'StringValue': 'feature_request',
                    'DataType': 'String'
                }
            }
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
        print(f"Ingestion error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({
                'error': 'Internal server error',
                'message': 'Failed to process request'
            })
        }