import { DeploymentStack, DeploymentEnvironment, SoftwareType } from '@amzn/pipelines';
import { CfnOutput, Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';

import * as iam from 'aws-cdk-lib/aws-iam';
import * as lakeformation from 'aws-cdk-lib/aws-lakeformation';
import * as glue from 'aws-cdk-lib/aws-glue';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as elasticsearch from 'aws-cdk-lib/aws-elasticsearch';

interface DataLakeStackProps {
  readonly env: DeploymentEnvironment;
  readonly stage: string;
}

export class DataLakeStack extends DeploymentStack {
  public readonly rawBucket: s3.Bucket;
  public readonly parquetBucket: s3.Bucket;
  public readonly ingestionApi: apigateway.RestApi;
  public readonly opensearchDomain: elasticsearch.Domain;

  constructor(scope: Construct, id: string, props: DataLakeStackProps) {
    super(scope, id, {
      env: props.env,
      softwareType: SoftwareType.LONG_RUNNING_SERVICE,
    });

    // S3 Buckets for Data Lake
    this.rawBucket = new s3.Bucket(this, 'RawDataBucket', {
      bucketName: `bt101-raw-data-${props.stage}-${this.account}`,
      versioned: true,
      lifecycleRules: [
        {
          id: 'TransitionToIA',
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: Duration.days(30),
            },
          ],
        },
      ],
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.parquetBucket = new s3.Bucket(this, 'ParquetDataBucket', {
      bucketName: `bt101-parquet-data-${props.stage}-${this.account}`,
      versioned: true,
      lifecycleRules: [
        {
          id: 'TransitionToIA',
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: Duration.days(30),
            },
          ],
        },
      ],
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Glue Database for Lake Formation
    new glue.CfnDatabase(this, 'DataLakeDatabase', {
      catalogId: this.account,
      databaseInput: {
        name: `bt101_datalake_${props.stage}`,
        description: 'Data Lake database for BT101 project',
      },
    });

    // Lake Formation Data Lake Settings
    new lakeformation.CfnDataLakeSettings(this, 'DataLakeSettings', {
      admins: [
        {
          dataLakePrincipalIdentifier: `arn:aws:iam::${this.account}:root`,
        },
      ],
    });

    // Ingestion Lambda Function
    const ingestionLambda = new lambda.Function(this, 'IngestionLambda', {
      functionName: `bt101-ingestion-${props.stage}`,
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
import json
import boto3
import uuid
from datetime import datetime

s3 = boto3.client('s3')

def handler(event, context):
    try:
        # Parse incoming data
        body = json.loads(event.get('body', '{}'))
        
        # Add metadata for feature request
        record = {
            'id': str(uuid.uuid4()),
            'timestamp': datetime.utcnow().isoformat(),
            'ingestion_source': 'api_gateway',
            'feature_request': body
        }
        
        # Store in raw bucket
        key = f"year={datetime.now().year}/month={datetime.now().month:02d}/day={datetime.now().day:02d}/{record['id']}.json"
        
        s3.put_object(
            Bucket='${this.rawBucket.bucketName}',
            Key=key,
            Body=json.dumps(record),
            ContentType='application/json'
        )
        
        return {
            'statusCode': 200,
            'body': json.dumps({'message': 'Data ingested successfully', 'id': record['id']})
        }
    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }
      `),
      timeout: Duration.seconds(30),
      memorySize: 256,
      logGroup: new logs.LogGroup(this, 'IngestionLambdaLogs', {
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
    });

    // Grant permissions to ingestion lambda
    this.rawBucket.grantWrite(ingestionLambda);

    // Enhanced Processing Lambda Function with Claude Integration
    const processingLambda = new lambda.Function(this, 'ProcessingLambda', {
      functionName: `bt101-processing-${props.stage}`,
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'enhanced_processing.handler',
      layers: [
        lambda.LayerVersion.fromLayerVersionArn(
          this,
          'PandasLayer',
          `arn:aws:lambda:${this.region}:336392948345:layer:AWSSDKPandas-Python311:7`,
        ),
      ],
      code: lambda.Code.fromAsset('../lambda'),
      timeout: Duration.minutes(5),
      memorySize: 1024,
      logGroup: new logs.LogGroup(this, 'ProcessingLambdaLogs', {
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
    });

    // Grant permissions to processing lambda
    this.rawBucket.grantRead(processingLambda);
    this.parquetBucket.grantWrite(processingLambda);

    // Grant processing lambda permission to invoke Claude functions
    processingLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['lambda:InvokeFunction'],
        resources: [
          `arn:aws:lambda:${this.region}:${this.account}:function:bt101-claude-classification-${props.stage}`,
          `arn:aws:lambda:${this.region}:${this.account}:function:bt101-claude-deduplication-${props.stage}`,
        ],
      }),
    );

    // Ensure Lambda has proper permissions for S3 invocation FIRST
    processingLambda.addPermission('AllowS3Invoke', {
      principal: new iam.ServicePrincipal('s3.amazonaws.com'),
      sourceArn: this.rawBucket.bucketArn,
      action: 'lambda:InvokeFunction',
    });

    // S3 event notification to trigger processing
    this.rawBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(processingLambda),
      {
        suffix: '.json',
      }
    );

    // Elasticsearch Domain for full-text search and vector similarity (kNN)
    this.opensearchDomain = new elasticsearch.Domain(this, 'ElasticsearchDomain', {
      domainName: `bt101-feature-search-${props.stage}`,
      version: elasticsearch.ElasticsearchVersion.V7_10,
      capacity: {
        dataNodes: 1,
        dataNodeInstanceType: 't3.small.elasticsearch',
      },
      ebs: {
        volumeSize: 20,
      },
      nodeToNodeEncryption: true,
      encryptionAtRest: {
        enabled: true,
      },
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Index Lambda Function for OpenSearch
    const indexLambda = new lambda.Function(this, 'IndexLambda', {
      functionName: `bt101-index-${props.stage}`,
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'index.handler',
      layers: [
        lambda.LayerVersion.fromLayerVersionArn(
          this,
          'PandasLayerForIndex',
          `arn:aws:lambda:${this.region}:336392948345:layer:AWSSDKPandas-Python311:7`,
        ),
      ],
      environment: {
        ELASTICSEARCH_ENDPOINT: this.opensearchDomain.domainEndpoint,
      },
      code: lambda.Code.fromInline(`
import json
import boto3
import pandas as pd
import io
import os
from urllib.parse import unquote_plus
from datetime import datetime
from botocore.auth import SigV4Auth
from botocore.awsrequest import AWSRequest
import urllib3

s3 = boto3.client('s3')
session = boto3.Session()
credentials = session.get_credentials()
http = urllib3.PoolManager()

def handler(event, context):
    try:
        elasticsearch_endpoint = f"https://{os.environ['ELASTICSEARCH_ENDPOINT']}"
        
        # Process S3 event from parquet bucket
        for record in event['Records']:
            bucket = record['s3']['bucket']['name']
            key = unquote_plus(record['s3']['object']['key'])
            
            print(f"Processing Parquet file: {key} from bucket: {bucket}")
            
            # Read Parquet file from S3
            response = s3.get_object(Bucket=bucket, Key=key)
            parquet_data = response['Body'].read()
            
            # Convert Parquet to DataFrame
            parquet_buffer = io.BytesIO(parquet_data)
            df = pd.read_parquet(parquet_buffer)
            
            print(f"Read {len(df)} records from Parquet file")
            
            # Index each record to Elasticsearch
            index_name = "bt101-feature-requests"
            
            for _, row in df.iterrows():
                # Prepare document for Elasticsearch
                doc = {
                    "id": row.get('id', ''),
                    "timestamp": row.get('timestamp', ''),
                    "ingestion_source": row.get('ingestion_source', ''),
                    "title": row.get('title', ''),
                    "description": row.get('description', ''),
                    "priority": row.get('priority', ''),
                    "category": row.get('category', ''),
                    "feature_request_raw": row.get('feature_request_raw', ''),
                    "indexed_at": datetime.utcnow().isoformat()
                }
                
                # Index document to Elasticsearch with AWS Signature V4
                doc_id = row.get('id', 'unknown')
                index_url = f"{elasticsearch_endpoint}/{index_name}/_doc/{doc_id}"
                
                # Create AWS request with SigV4 authentication
                request = AWSRequest(method='PUT', url=index_url, data=json.dumps(doc), headers={'Content-Type': 'application/json'})
                SigV4Auth(credentials, 'es', os.environ['AWS_REGION']).add_auth(request)
                
                # Make the request
                response = http.request(
                    request.method,
                    request.url,
                    body=request.body,
                    headers=dict(request.headers)
                )
                
                if response.status in [200, 201]:
                    print(f"Successfully indexed document {doc_id}")
                else:
                    print(f"Failed to index document {doc_id}: {response.status} - {response.data.decode()}")
            
            print(f"Completed indexing for file: {key}")
            
        return {'statusCode': 200, 'body': 'Indexing completed successfully'}
        
    except Exception as e:
        print(f"Error during indexing: {str(e)}")
        import traceback
        traceback.print_exc()
        return {'statusCode': 500, 'body': str(e)}
      `),
      timeout: Duration.minutes(10),
      memorySize: 1024,
      logGroup: new logs.LogGroup(this, 'IndexLambdaLogs', {
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
    });

    // Update Elasticsearch access policy to allow Index Lambda
    this.opensearchDomain.addAccessPolicies(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [indexLambda.role as iam.IPrincipal],
        actions: ['es:ESHttpGet', 'es:ESHttpPost', 'es:ESHttpPut'],
        resources: [this.opensearchDomain.domainArn + '/*'],
      }),
    );

    // Grant permissions to index lambda
    this.parquetBucket.grantRead(indexLambda);
    this.opensearchDomain.grantWrite(indexLambda);

    // Add VPC endpoint permissions if needed
    indexLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['es:ESHttpPost', 'es:ESHttpPut', 'es:ESHttpGet'],
        resources: [this.opensearchDomain.domainArn + '/*'],
      }),
    );

    // S3 event notification for indexing
    this.parquetBucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.LambdaDestination(indexLambda), {
      suffix: '.parquet',
    });

    // API Gateway for Ingestion
    this.ingestionApi = new apigateway.RestApi(this, 'IngestionAPI', {
      restApiName: `bt101-ingestion-api-${props.stage}`,
      description: 'Data Lake Ingestion API',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

    // Search Lambda Function
    const searchLambda = new lambda.Function(this, 'SearchLambda', {
      functionName: `bt101-search-${props.stage}`,
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
import json,boto3,os
from botocore.auth import SigV4Auth
from botocore.awsrequest import AWSRequest
import urllib3
def handler(e,c):
 try:
  s=boto3.Session();cr=s.get_credentials();http=urllib3.PoolManager()
  ep=f"https://{os.environ['ELASTICSEARCH_ENDPOINT']}"
  q=e.get('queryStringParameters') or {}
  t,sz=q.get('q',''),int(q.get('size','10'))
  eq={"size":sz,"query":{"match_all":{}}} if not t else {"size":sz,"query":{"multi_match":{"query":t,"fields":["title","description"]}}}
  r=AWSRequest('POST',f"{ep}/bt101-feature-requests/_search",json.dumps(eq),{'Content-Type':'application/json'})
  SigV4Auth(cr,'es',os.environ['AWS_REGION']).add_auth(r)
  res=http.request(r.method,r.url,body=r.body,headers=dict(r.headers))
  if res.status==200:
   d=json.loads(res.data.decode());hits=d.get('hits',{}).get('hits',[])
   return {'statusCode':200,'headers':{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'},'body':json.dumps({'total':d.get('hits',{}).get('total',{}).get('value',0),'results':[{'id':hit['_source'].get('id'),'title':hit['_source'].get('title'),'description':hit['_source'].get('description'),'priority':hit['_source'].get('priority'),'category':hit['_source'].get('category'),'timestamp':hit['_source'].get('timestamp'),'score':hit['_score']} for hit in hits]})
  return {'statusCode':500,'body':json.dumps({'error':f'Failed: {res.status}'})}
 except Exception as ex:return {'statusCode':500,'body':json.dumps({'error':str(ex)})}
      `),
      environment: {
        ELASTICSEARCH_ENDPOINT: this.opensearchDomain.domainEndpoint,
      },
      timeout: Duration.seconds(30),
      memorySize: 256,
    });

    // Grant search permissions
    this.opensearchDomain.grantRead(searchLambda);
    searchLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['es:ESHttpGet', 'es:ESHttpPost'],
        resources: [this.opensearchDomain.domainArn + '/*'],
      }),
    );

    // Update Elasticsearch access policy for search
    this.opensearchDomain.addAccessPolicies(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [searchLambda.role as iam.IPrincipal],
        actions: ['es:ESHttpGet', 'es:ESHttpPost'],
        resources: [this.opensearchDomain.domainArn + '/*'],
      }),
    );

    // API Gateway Integration
    const ingestionIntegration = new apigateway.LambdaIntegration(ingestionLambda);
    const searchIntegration = new apigateway.LambdaIntegration(searchLambda);

    const dataResource = this.ingestionApi.root.addResource('data');
    dataResource.addMethod('POST', ingestionIntegration);

    const searchResource = this.ingestionApi.root.addResource('search');
    searchResource.addMethod('GET', searchIntegration);

    // Athena for querying
    const athenaRole = new iam.Role(this, 'AthenaRole', {
      assumedBy: new iam.ServicePrincipal('athena.amazonaws.com'),
      inlinePolicies: {
        AthenaPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['athena:*', 'glue:GetDatabase', 'glue:GetTable', 'glue:GetTables', 'glue:GetPartitions'],
              resources: ['*'],
            }),
          ],
        }),
      },
    });

    this.rawBucket.grantRead(athenaRole);
    this.parquetBucket.grantRead(athenaRole);

    // Outputs
    new CfnOutput(this, 'IngestionAPIURL', {
      value: this.ingestionApi.url,
      description: 'API Gateway URL for ingestion and search',
    });
  }
}
