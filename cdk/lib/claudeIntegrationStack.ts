import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import { Function as LambdaFunction, Runtime, Code } from 'aws-cdk-lib/aws-lambda';
import { PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { DeploymentEnvironment } from '@amzn/pipelines';

export interface ClaudeIntegrationStackProps {
  readonly env: DeploymentEnvironment;
  readonly stage: string;
}

import { DeploymentStack, SoftwareType } from '@amzn/pipelines';

export class ClaudeIntegrationStack extends DeploymentStack {
  public readonly classificationFunction: LambdaFunction;
  public readonly deduplicationFunction: LambdaFunction;

  constructor(scope: Construct, id: string, props: ClaudeIntegrationStackProps) {
    super(scope, id, {
      env: props.env,
      softwareType: SoftwareType.LONG_RUNNING_SERVICE,
    });

    // Claude Classification Lambda
    this.classificationFunction = new LambdaFunction(this, 'ClaudeClassificationFunction', {
      functionName: `bt101-claude-classification-${props.stage}`,
      runtime: Runtime.PYTHON_3_11,
      handler: 'classification.handler',
      code: Code.fromAsset('../lambda'),
      timeout: Duration.minutes(5),
      memorySize: 1024,
    });

    // Claude Deduplication Lambda
    this.deduplicationFunction = new LambdaFunction(this, 'ClaudeDeduplicationFunction', {
      functionName: `bt101-claude-deduplication-${props.stage}`,
      runtime: Runtime.PYTHON_3_11,
      handler: 'deduplication.handler',
      code: Code.fromAsset('../lambda'),
      timeout: Duration.minutes(5),
      memorySize: 1024,
    });

    // Bedrock permissions
    const bedrockPolicy = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
      resources: ['arn:aws:bedrock:*::foundation-model/anthropic.claude-*'],
    });

    this.classificationFunction.addToRolePolicy(bedrockPolicy);
    this.deduplicationFunction.addToRolePolicy(bedrockPolicy);
  }
}
