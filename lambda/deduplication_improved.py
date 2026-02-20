import json
import boto3
from datetime import datetime

s3 = boto3.client('s3')
bedrock = boto3.client('bedrock-runtime', region_name='us-west-2')

def handler(event, context):
    """Improved deduplication with stricter criteria"""
    try:
        current_id = event.get('id', '')
        title = event.get('title', '')
        description = event.get('description', '')
        
        print(f"DEBUG: Processing request ID: {current_id}")
        print(f"DEBUG: Title: {title}")
        
        if not title or not description:
            print("DEBUG: Missing title or description")
            return {
                'statusCode': 200,
                'body': {
                    'is_duplicate': False,
                    'confidence': 0,
                    'similar_requests': []
                }
            }
        
        existing_requests = get_existing_requests_excluding_current(current_id)
        
        print(f"DEBUG: Found {len(existing_requests)} existing requests to compare against")
        for req in existing_requests:
            print(f"DEBUG: Existing request - ID: {req['id']}, Title: {req['title'][:50]}...")
        
        if not existing_requests:
            print("DEBUG: No existing requests found - marking as not duplicate")
            return {
                'statusCode': 200,
                'body': {
                    'is_duplicate': False,
                    'confidence': 0,
                    'similar_requests': [],
                    'reason': 'No previous requests to compare against'
                }
            }
        
        duplicate_result = find_duplicates_with_improved_prompt(title, description, existing_requests)
        print(f"DEBUG: Claude result: {duplicate_result}")
        
        return {
            'statusCode': 200,
            'body': duplicate_result
        }
        
    except Exception as e:
        print(f"Deduplication error: {e}")
        return {
            'statusCode': 200,
            'body': {
                'is_duplicate': False,
                'confidence': 0,
                'similar_requests': []
            }
        }

def get_existing_requests_excluding_current(current_id):
    """Read existing requests from raw JSON bucket, excluding current request"""
    try:
        bucket = 'bt101-raw-data-alpha-012258635969'
        today = datetime.now()
        prefix = f'year={today.year}/month={today.month:02d}/day={today.day:02d}/'
        
        response = s3.list_objects_v2(Bucket=bucket, Prefix=prefix, MaxKeys=20)
        
        if 'Contents' not in response:
            return []
        
        requests = []
        for obj in response['Contents'][-10:]:
            if obj['Key'].endswith('.json'):
                file_id = obj['Key'].split('/')[-1].replace('.json', '')
                
                if file_id == current_id:
                    print(f"DEBUG: Skipping current request: {file_id}")
                    continue
                    
                try:
                    json_obj = s3.get_object(Bucket=bucket, Key=obj['Key'])
                    data = json.loads(json_obj['Body'].read())
                    
                    feature_req = data.get('feature_request', {})
                    if feature_req.get('title') and feature_req.get('description'):
                        requests.append({
                            'id': data.get('id', file_id),
                            'title': feature_req.get('title', ''),
                            'description': feature_req.get('description', '')
                        })
                except Exception as e:
                    print(f"Error reading {obj['Key']}: {e}")
                    continue
        
        return requests
        
    except Exception as e:
        print(f"Error getting existing requests: {e}")
        return []

def find_duplicates_with_improved_prompt(title, description, existing_requests):
    """Use Claude with improved, stricter prompt"""
    try:
        existing_text = "\n".join([
            f"ID: {req['id']}\nTitle: {req['title']}\nDescription: {req['description']}\n---"
            for req in existing_requests
        ])
        
        prompt = f"""You are a precise duplicate detector for feature requests. Compare the NEW REQUEST against EXISTING REQUESTS.

NEW REQUEST:
Title: {title}
Description: {description}

EXISTING REQUESTS:
{existing_text}

STRICT DUPLICATE CRITERIA - Mark as duplicate ONLY if:
1. Same specific technology/service (e.g., both about Lambda, both about S3, both about IoT)
2. Same primary function (e.g., both for data storage, both for notifications, both for analytics)
3. Same target use case (e.g., both for mobile apps, both for web dashboards, both for supply chain)

DO NOT mark as duplicate if:
- Only sharing generic terms like "platform", "system", "monitoring", "analytics"
- Different technologies (IoT vs Analytics, Blockchain vs Mobile, etc.)
- Different primary purposes (device management vs data visualization)
- Different domains (supply chain vs business intelligence)

Respond with JSON:
{{
    "is_duplicate": true/false,
    "confidence": 0.0-1.0,
    "most_similar_request_id": "id or null",
    "reasoning": "specific explanation citing exact similarities or differences"
}}

Be conservative - when in doubt, mark as NOT duplicate."""

        print("DEBUG: Calling Claude for duplicate analysis")
        
        response = bedrock.invoke_model(
            modelId='anthropic.claude-3-haiku-20240307-v1:0',
            body=json.dumps({
                'anthropic_version': 'bedrock-2023-05-31',
                'max_tokens': 1000,
                'messages': [{'role': 'user', 'content': prompt}]
            })
        )
        
        result = json.loads(response['body'].read())
        claude_response = result['content'][0]['text']
        print(f"DEBUG: Claude raw response: {claude_response}")
        
        try:
            duplicate_result = json.loads(claude_response)
            return {
                'is_duplicate': duplicate_result.get('is_duplicate', False),
                'confidence': duplicate_result.get('confidence', 0),
                'most_similar_request_id': duplicate_result.get('most_similar_request_id', ''),
                'similar_requests': [duplicate_result.get('most_similar_request_id')] if duplicate_result.get('most_similar_request_id') else [],
                'reasoning': duplicate_result.get('reasoning', '')
            }
        except:
            return {
                'is_duplicate': False,
                'confidence': 0,
                'similar_requests': []
            }
            
    except Exception as e:
        print(f"Claude deduplication error: {e}")
        return {
            'is_duplicate': False,
            'confidence': 0,
            'similar_requests': []
        }