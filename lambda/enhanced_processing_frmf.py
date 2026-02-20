import json
import boto3
import pandas as pd
from datetime import datetime
import uuid
import io
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

s3 = boto3.client('s3')
lambda_client = boto3.client('lambda')

def handler(event, context):
    """Enhanced processing with FRMF extensions"""
    try:
        # Get S3 event details
        bucket = event['Records'][0]['s3']['bucket']['name']
        key = event['Records'][0]['s3']['object']['key']
        
        logger.info(f"Processing file: s3://{bucket}/{key}")
        
        # Read JSON file from S3
        response = s3.get_object(Bucket=bucket, Key=key)
        json_data = json.loads(response['Body'].read())
        
        # Step 1: Claude Classification with FRMF forecast
        classification_result = invoke_claude_classification_frmf(json_data)
        
        # Step 2: Claude Deduplication
        dedup_result = invoke_claude_deduplication(classification_result)
        
        # Step 3: Generate workaround if available
        workaround_result = invoke_claude_workaround(dedup_result)
        
        # Step 4: Convert to Parquet with FRMF enhancements
        parquet_key = convert_to_parquet_with_frmf(workaround_result, key)
        
        logger.info(f"FRMF enhanced processing complete: {parquet_key}")
        
        return {
            'statusCode': 200,
            'body': {
                'message': 'FRMF enhanced processing successful',
                'parquet_file': parquet_key,
                'frmf_enhanced': True
            }
        }
        
    except Exception as e:
        logger.error(f"FRMF processing error: {str(e)}")
        raise

def invoke_claude_classification_frmf(data):
    """Enhanced Claude classification with FRMF forecast prediction"""
    try:
        feature_req = data.get('feature_request', {})
        claude_payload = {
            'title': feature_req.get('title', ''),
            'description': feature_req.get('description', ''),
            'priority': feature_req.get('priority', ''),
            'category': feature_req.get('category', ''),
            'frmf_mode': True  # Enable FRMF forecast prediction
        }
        
        response = lambda_client.invoke(
            FunctionName='bt101-claude-classification-alpha',
            InvocationType='RequestResponse',
            Payload=json.dumps(claude_payload)
        )
        
        result = json.loads(response['Payload'].read())
        
        if 'body' in result and isinstance(result['body'], str):
            classification = json.loads(result['body'])
        else:
            classification = result.get('body', result)
        
        # Add FRMF classification to original data
        enhanced_data = data.copy()
        enhanced_data['frmf_classification'] = classification
        return enhanced_data
        
    except Exception as e:
        logger.warning(f"FRMF classification failed: {e}")
        return data

def invoke_claude_deduplication(data):
    """Invoke Claude deduplication Lambda"""
    try:
        feature_req = data.get('feature_request', {})
        claude_payload = {
            'id': data.get('id', ''),  # Pass the request ID
            'title': feature_req.get('title', ''),
            'description': feature_req.get('description', '')
        }
        
        response = lambda_client.invoke(
            FunctionName='bt101-claude-deduplication-alpha',
            InvocationType='RequestResponse',
            Payload=json.dumps(claude_payload)
        )
        
        result = json.loads(response['Payload'].read())
        
        if 'body' in result and isinstance(result['body'], str):
            dedup_result = json.loads(result['body'])
        else:
            dedup_result = result.get('body', result)
        
        enhanced_data = data.copy()
        enhanced_data['deduplication_result'] = dedup_result
        return enhanced_data
        
    except Exception as e:
        logger.warning(f"Deduplication failed: {e}")
        return data

def invoke_claude_workaround(data):
    """Generate workaround suggestions using Claude"""
    try:
        feature_req = data.get('feature_request', {})
        claude_payload = {
            'title': feature_req.get('title', ''),
            'description': feature_req.get('description', ''),
            'category': feature_req.get('category', ''),
            'priority': feature_req.get('priority', '')
        }
        
        # Call workaround generation function (to be implemented)
        # For now, return placeholder
        workaround_result = {
            'workaround_available': False,
            'workaround_text': '',
            'workaround_confidence': 0
        }
        
        enhanced_data = data.copy()
        enhanced_data['workaround_result'] = workaround_result
        return enhanced_data
        
    except Exception as e:
        logger.warning(f"Workaround generation failed: {e}")
        return data

def convert_to_parquet_with_frmf(enhanced_data, original_key):
    """Convert enhanced data to Parquet format with FRMF fields"""
    # Base data structure
    flattened_data = {
        'id': enhanced_data.get('id'),
        'timestamp': enhanced_data.get('timestamp'),
        'ingestion_source': enhanced_data.get('ingestion_source'),
        'feature_request_raw': json.dumps(enhanced_data.get('feature_request', {})),
    }
    
    # Extract feature request fields
    feature_req = enhanced_data.get('feature_request', {})
    if isinstance(feature_req, dict):
        flattened_data.update({
            'title': feature_req.get('title', ''),
            'description': feature_req.get('description', ''),
            'priority': feature_req.get('priority', ''),
            'category': feature_req.get('category', ''),
        })
    
    # Add FRMF classification results
    frmf_classification = enhanced_data.get('frmf_classification', {})
    if frmf_classification:
        flattened_data.update({
            'ai_category': frmf_classification.get('category', ''),
            'ai_priority': frmf_classification.get('priority', ''),
            'ai_complexity': frmf_classification.get('complexity', ''),
            'ai_effort': frmf_classification.get('estimated_effort', ''),
            'ai_tags': json.dumps(frmf_classification.get('tags', [])),
            # FRMF Extensions
            'forecast_status': frmf_classification.get('forecast_status', 'submitted'),
            'forecast_timeline': frmf_classification.get('forecast_timeline', ''),
            'forecast_confidence': frmf_classification.get('forecast_confidence', 0),
            'service_team': frmf_classification.get('service_team', ''),
            'customer_visible': True,
            'legal_disclaimer_accepted': feature_req.get('legal_disclaimer_accepted', False),
        })
    
    # Add deduplication results
    dedup = enhanced_data.get('deduplication_result', {})
    if dedup:
        flattened_data.update({
            'is_duplicate': dedup.get('is_duplicate', False),
            'duplicate_confidence': dedup.get('confidence', 0),
            'similar_request_id': dedup.get('most_similar_request_id', ''),
        })
    
    # Add workaround results
    workaround = enhanced_data.get('workaround_result', {})
    if workaround:
        flattened_data.update({
            'workaround_available': workaround.get('workaround_available', False),
            'workaround_text': workaround.get('workaround_text', ''),
            'workaround_confidence': workaround.get('workaround_confidence', 0),
        })
    
    # Create DataFrame and convert to Parquet
    df = pd.DataFrame([flattened_data])
    
    parquet_buffer = io.BytesIO()
    df.to_parquet(parquet_buffer, index=False, engine='pyarrow')
    parquet_buffer.seek(0)
    
    # Generate parquet file key
    parquet_key = original_key.replace('.json', '.parquet')
    parquet_bucket = 'bt101-parquet-data-alpha-012258635969'
    
    # Upload to parquet bucket
    s3.put_object(
        Bucket=parquet_bucket,
        Key=parquet_key,
        Body=parquet_buffer.getvalue(),
        ContentType='application/octet-stream'
    )
    
    logger.info(f"FRMF-enhanced Parquet file created: s3://{parquet_bucket}/{parquet_key}")
    return parquet_key