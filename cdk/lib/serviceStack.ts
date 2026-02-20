import { HydraTestRunResources, HydraBootstrapMode } from '@amzn/hydra';
import {
  BrazilPackage,
  DeploymentEnvironment,
  DeploymentStack,
  HydraTestApprovalWorkflowStep,
  LambdaAsset,
  Platform,
  SoftwareType,
} from '@amzn/pipelines';
import { Duration, Fn } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Alarm, ComparisonOperator, MathExpression, TreatMissingData } from 'aws-cdk-lib/aws-cloudwatch';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Architecture, Alias, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { ILambdaDeploymentConfig, LambdaDeploymentConfig, LambdaDeploymentGroup } from 'aws-cdk-lib/aws-codedeploy';

interface ServiceStackProps {
  readonly env: DeploymentEnvironment;
  readonly stage: string;
  /**
   * Whether or not the Lambda function will serve customer traffic.
   * Monitoring and deployment configurations will be more conservative
   * when this flag is set to true.
   *
   * @default - false
   */
  readonly isProd: boolean;

  /**
   * Whether the Lambda function should be deployed gradually. Gradual deployment is highly
   * recommended for production but can slow down the development or testing workflow. Set
   * this prop to `false` if you want CDK hotswap to work.
   *
   * @default - true
   */
  readonly enableGradualDeployment?: boolean;
}

export class ServiceStack extends DeploymentStack {
  private readonly hydraResources: HydraTestRunResources;
  private readonly stage: string;
  // eslint-disable-next-line @typescript-eslint/ban-types
  public readonly lambdaFunction: Function;

  private readonly lambdaFunctionAlias: Alias;

  // Pipelines will inject a boolean value into a stack parameter that
  // can be examined to determine if a deployment is a rollback. This
  // enables one to deploy more aggressively during a rollback [e.g.,
  // to ignore alarms or disable incremental deployment]. To do so
  // requires one to select a value for these settings at deploy-time,
  // by using a CloudFormation conditional expression.
  private readonly ifRollback = <T extends string>(then: T, otherwise: T): T =>
    Fn.conditionIf(this.pipelinesRollbackCondition.logicalId, then, otherwise).toString() as T;

  constructor(scope: Construct, id: string, props: ServiceStackProps) {
    super(scope, id, {
      env: props.env,
      softwareType: SoftwareType.LONG_RUNNING_SERVICE,
    });
    this.stage = props.stage;

    const enableGradualDeployment = props.enableGradualDeployment ?? true;

    this.lambdaFunction = new Function(this, 'FRLM', {
      functionName: 'FRLM',
      description: `Timestamp: ${new Date().toISOString()} `,
      code: LambdaAsset.fromBrazil({
        brazilPackage: BrazilPackage.fromString('FRLM-1.0'),
        componentName: 'Lambda',
      }),
      handler: 'com.amazon.frlm.lambda.calculator.Calculator::add',
      logGroup: new LogGroup(this, `FRLMLogGroup`, {
        retention: RetentionDays.TEN_YEARS,
      }),
      memorySize: 512,
      timeout: Duration.seconds(30),
      runtime: Runtime.JAVA_17,
      architecture: Architecture.X86_64,
    });

    // Create separate Lambda functions for each operation
    const addFunction = new Function(this, 'AddFunction', {
      functionName: 'BT101rajeshpc-AddFunction',
      description: `Add Function - Timestamp: ${new Date().toISOString()} `,
      code: LambdaAsset.fromBrazil({
        brazilPackage: BrazilPackage.fromString('FRLM-1.0'),
        componentName: 'Lambda',
      }),
      handler: 'com.amazon.frlm.lambda.calculator.Calculator::add',
      logGroup: new LogGroup(this, `AddFunctionLogGroup`, {
        retention: RetentionDays.TEN_YEARS,
      }),
      memorySize: 512,
      timeout: Duration.seconds(30),
      runtime: Runtime.JAVA_17,
      architecture: Architecture.X86_64,
    });

    const subtractFunction = new Function(this, 'SubtractFunction', {
      functionName: 'BT101rajeshpc-SubtractFunction',
      description: `Subtract Function - Timestamp: ${new Date().toISOString()} `,
      code: LambdaAsset.fromBrazil({
        brazilPackage: BrazilPackage.fromString('FRLM-1.0'),
        componentName: 'Lambda',
      }),
      handler: 'com.amazon.frlm.lambda.calculator.Calculator::subtract',
      logGroup: new LogGroup(this, `SubtractFunctionLogGroup`, {
        retention: RetentionDays.TEN_YEARS,
      }),
      memorySize: 512,
      timeout: Duration.seconds(30),
      runtime: Runtime.JAVA_17,
      architecture: Architecture.X86_64,
    });

    // Keep the original function for backward compatibility
    this.lambdaFunction = addFunction;

    this.lambdaFunctionAlias = new Alias(this, 'FRLMFunctionAlias', {
      aliasName: 'live',
      version: this.lambdaFunction.currentVersion,
    });

    // Create auto-scaling target
    const autoScaling = this.lambdaFunctionAlias.addAutoScaling({ maxCapacity: 20 });

    // Configure target tracking
    autoScaling.scaleOnUtilization({ utilizationTarget: 0.5 });

    if (enableGradualDeployment) {
      // Non-prod stages may have zero traffic and may block deployment unnecessarily, thus
      // we only apply overall success rate alarm in prod.
      this.addGradualDeployment(props.isProd);
    }

    this.hydraResources = new HydraTestRunResources(this, 'FRLMHydraTestRunResources', {
      hydraEnvironment: props.env.hydraEnvironment,
      bootstrapMode: HydraBootstrapMode.AUTO,
      hydraAsset: {
        targetPackage: BrazilPackage.fromString('FRLMTests-1.0'),
      },
    });

    this.lambdaFunction.grantInvoke(this.hydraResources.invocationRole);
    subtractFunction.grantInvoke(this.hydraResources.invocationRole);
  }

  private addGradualDeployment(isProd: boolean) {
    /*
     * Configuring incremental deployment with rollback rule. The rule is to rollback when one of
     * the following conditions is true:
     *   * The success rate of the new version of your Lambda function is below 95%.
     *   * The overall success rate of your Lambda function is below 99%.
     */
    const newFunctionVersionSuccessRateMetric = new MathExpression({
      label: 'Success Rate',
      expression: '100 - 100*error/invocations',
      period: Duration.minutes(1),
      usingMetrics: {
        error: this.lambdaFunction.metricErrors({
          dimensionsMap: {
            FunctionName: this.lambdaFunction.functionName,
            ExecutedVersion: this.lambdaFunction.currentVersion.version,
            Resource: `${this.lambdaFunction.functionName}:${this.lambdaFunctionAlias.aliasName}`,
          },
        }),
        invocations: this.lambdaFunction.metricInvocations({
          dimensionsMap: {
            FunctionName: this.lambdaFunction.functionName,
            ExecutedVersion: this.lambdaFunction.currentVersion.version,
            Resource: `${this.lambdaFunction.functionName}:${this.lambdaFunctionAlias.aliasName}`,
          },
        }),
      },
    });

    const overallFunctionSuccessRateMetric = new MathExpression({
      label: 'Success Rate',
      expression: '100 - 100*error/invocations',
      period: Duration.minutes(1),
      usingMetrics: {
        error: this.lambdaFunctionAlias.metricErrors(),
        invocations: this.lambdaFunctionAlias.metricInvocations(),
      },
    });

    // Define alarms
    const newFunctionSuccessRateAlarm = new Alarm(this, 'FRLMNewFunctionSuccessRateAlarm', {
      threshold: 95,
      comparisonOperator: ComparisonOperator.LESS_THAN_THRESHOLD,
      evaluationPeriods: 3,
      datapointsToAlarm: 2,
      metric: newFunctionVersionSuccessRateMetric,
      // New version may have low or even no traffic to begin with,
      // it might be unsafe to consider missing data as breaching.
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });

    const overallFunctionSuccessRateAlarm = new Alarm(this, 'FRLMOverallFunctionSuccessRateAlarm', {
      threshold: 99,
      comparisonOperator: ComparisonOperator.LESS_THAN_THRESHOLD,
      evaluationPeriods: 3,
      datapointsToAlarm: 2,
      metric: overallFunctionSuccessRateMetric,
      treatMissingData: TreatMissingData.BREACHING,
    });

    // Non-prod stages may have zero traffic and may block deployment unnecessarily, thus
    // we only apply overall success rate alarm in prod.
    const alarms = [newFunctionSuccessRateAlarm];
    if (isProd) {
      alarms.push(overallFunctionSuccessRateAlarm);
    }

    // Putting the deployment configuration and alarms together
    new LambdaDeploymentGroup(this, 'FRLMDeploymentGroup', {
      alias: this.lambdaFunctionAlias,
      deploymentConfig: this.createDeploymentConfig(isProd),
      alarms,
    });
  }

  private createDeploymentConfig(isProd: boolean): ILambdaDeploymentConfig {
    const deploymentConfiguration = isProd
      ? LambdaDeploymentConfig.CANARY_10PERCENT_5MINUTES
      : LambdaDeploymentConfig.ALL_AT_ONCE;
    const rollbackDeploymentConfiguration = LambdaDeploymentConfig.ALL_AT_ONCE;

    // Support in CDK for CloudFormation conditional expressions is limited to simple
    // types. Thus, we condition the value of each attribute of a single shape,
    // instead of conditionally returning one of two shapes.
    // See https://github.com/aws/aws-cdk/issues/8396
    return {
      deploymentConfigName: this.ifRollback(
        rollbackDeploymentConfiguration.deploymentConfigName,
        deploymentConfiguration.deploymentConfigName,
      ),
      deploymentConfigArn: this.ifRollback(
        rollbackDeploymentConfiguration.deploymentConfigArn,
        deploymentConfiguration.deploymentConfigArn,
      ),
    };
  }

  createIntegrationTestsApprovalWorkflowStep(
    name: string,
    versionSetPlatform: Platform,
  ): HydraTestApprovalWorkflowStep {
    return this.hydraResources.createApprovalWorkflowStep({
      name,
      // Hydra Test Run Definition, which defines parameters to run the test step.
      // See: https://w.amazon.com/bin/view/HydraTestPlatform/RunDefinition/
      runDefinition: {
        SchemaVersion: '1.0',
        SchemaType: 'HydraJavaJUnit',
        HydraParameters: {
          Runtime: 'java17',
          ComputeEngine: 'Lambda',
        },
        HandlerParameters: {
          TestClasses: {
            PackageSelector: [
              {
                Package: 'com.amazon.frlm',
                ClassNamePattern: '.*Test',
              },
            ],
          },
        },
        EnvironmentVariables: {
          Stage: this.stage,
        },
      },
      versionSetPlatform,
    });
  }
}
