import { DeploymentEnvironment, DeploymentStack, SoftwareType } from '@amzn/pipelines';
import { Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  Alarm,
  AlarmWidget,
  ComparisonOperator,
  Dashboard,
  GraphWidget,
  MathExpression,
  PeriodOverride,
  Statistic,
  TextWidget,
  TreatMissingData,
} from 'aws-cdk-lib/aws-cloudwatch';
import { IFunction } from 'aws-cdk-lib/aws-lambda';

interface MonitoringStackProps {
  readonly env: DeploymentEnvironment;
  readonly lambdaFunction: IFunction;
}

export class MonitoringStack extends DeploymentStack {
  constructor(scope: Construct, id: string, readonly props: MonitoringStackProps) {
    super(scope, id, {
      env: props.env,
      softwareType: SoftwareType.INFRASTRUCTURE,
    });
    this.createSummaryDashboard();
    this.createServiceDashboard();
  }

  /**
   * Create a summary dashboard for the application with the metrics for TPS, duration, and
   * error (counts and rates).
   */
  private createSummaryDashboard() {
    const summaryDashboard = new Dashboard(this, 'FRLMSummaryDashboard', {
      dashboardName: `FRLM-Summary`,
      start: '-' + Duration.days(14).toIsoString(),
      periodOverride: PeriodOverride.INHERIT,
    });

    summaryDashboard.addWidgets(
      // Header
      new TextWidget({
        width: 24,
        height: 1,
        markdown: '# Summary dashboard',
      }),
      new TextWidget({
        width: 24,
        height: 1,
        markdown: '## Lambda function',
      }),
      // TPS
      new GraphWidget({
        width: 24,
        height: 6,
        title: 'AVG TPS (1 minute)',
        left: [
          new MathExpression({
            expression: 'requests/PERIOD(requests)',
            usingMetrics: {
              requests: this.props.lambdaFunction.metricInvocations(),
            },
            label: 'TPS',
            period: Duration.minutes(1),
          }),
        ],
        leftYAxis: {
          min: 0,
          showUnits: false,
        },
      }),
      // Concurrency
      new GraphWidget({
        width: 24,
        height: 6,
        title: 'Concurrency',
        left: [
          this.props.lambdaFunction.metric('ConcurrentExecutions', {
            statistic: Statistic.MAXIMUM,
          }),
        ],
        leftYAxis: {
          showUnits: false,
        },
      }),
      // Duration
      new GraphWidget({
        width: 24,
        height: 6,
        title: 'Duration',
        left: [
          this.props.lambdaFunction.metricDuration({
            statistic: 'p50',
            label: 'P50',
          }),
          this.props.lambdaFunction.metricDuration({
            statistic: 'p90',
            label: 'P90',
          }),
          this.props.lambdaFunction.metricDuration({
            statistic: 'p99',
            label: 'P99',
          }),
        ],
        leftYAxis: {
          min: 0,
          label: 'ms',
          showUnits: false,
        },
      }),
      // Error
      new GraphWidget({
        width: 24,
        height: 6,
        title: 'Error',
        left: [
          this.props.lambdaFunction.metricErrors({
            label: 'Counts',
          }),
        ],
        right: [
          new MathExpression({
            expression: 'errors*100/invocations',
            usingMetrics: {
              errors: this.props.lambdaFunction.metricErrors(),
              invocations: this.props.lambdaFunction.metricInvocations(),
            },
            label: 'Rates',
          }),
        ],
        leftYAxis: {
          min: 0,
          showUnits: false,
        },
        rightYAxis: {
          min: 0,
          label: '%',
          showUnits: false,
        },
      }),
    );
  }

  /**
   * Create a system-level dashboard with graphs for error (counts and rates), throttle rates,
   * provisioned concurrency spillover counts, and durations. Ideally, each metric is associated
   * with an alarm. Metrics that are not associated with an alarm should be placed in a different
   * dashboard or at the bottom of this dashboard.
   *
   * The default thresholds are just the starting point based on the Golden Path recommendations,
   * they need to be adjusted accordingly as the service grows.
   * Reference: https://builderhub.corp.amazon.com/docs/native-aws/developer-guide/golden-path-lambda.html#golden-path-monitoring-and-alarms
   */
  private createServiceDashboard() {
    const serviceDashboard = new Dashboard(this, 'FRLMServiceDashboard', {
      dashboardName: 'FRLM-Service',
      start: '-' + Duration.hours(8).toIsoString(),
      periodOverride: PeriodOverride.INHERIT,
    });

    serviceDashboard.addWidgets(
      // Header
      new TextWidget({
        width: 24,
        height: 1,
        markdown: '# Service dashboard',
      }),
      // Errors
      new AlarmWidget({
        width: 12,
        height: 6,
        title: 'Error count',
        alarm: new Alarm(this, 'FRLMLambdaFunctionErrorCountAlarm', {
          metric: this.props.lambdaFunction.metricErrors({
            period: Duration.minutes(1),
          }),
          threshold: 1,
          comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
          evaluationPeriods: 1,
        }),
        leftYAxis: {
          min: 0,
          showUnits: false,
        },
      }),
      new AlarmWidget({
        width: 12,
        height: 6,
        title: 'Error rate',
        alarm: new Alarm(this, 'FRLMLambdaFunctionErrorRateAlarm', {
          metric: new MathExpression({
            expression: 'errors*100/invocations',
            usingMetrics: {
              errors: this.props.lambdaFunction.metricErrors(),
              invocations: this.props.lambdaFunction.metricInvocations(),
            },
            period: Duration.minutes(1),
            label: 'Rates',
          }),
          threshold: 0.5,
          evaluationPeriods: 5,
        }),
        leftYAxis: {
          min: 0,
          label: '%',
          showUnits: false,
        },
      }),
      // Throttle
      new AlarmWidget({
        width: 24,
        height: 6,
        title: 'Throttle rate',
        alarm: new Alarm(this, 'FRLMLambdaFunctionThrottleRate', {
          metric: new MathExpression({
            expression: 'throttles*100/invocations',
            usingMetrics: {
              throttles: this.props.lambdaFunction.metricThrottles(),
              invocations: this.props.lambdaFunction.metricInvocations(),
            },
            period: Duration.minutes(1),
            label: 'Rates',
          }),
          threshold: 1,
          evaluationPeriods: 5,
        }),
        leftYAxis: {
          min: 0,
          label: '%',
          showUnits: false,
        },
      }),
      // Provisioned concurrency spillover
      new AlarmWidget({
        width: 24,
        height: 6,
        title: 'Provisioned concurrency spillover',
        alarm: new Alarm(this, 'FRLMProvisionConcurrencySpilloverAlarm', {
          metric: this.props.lambdaFunction.metric('ProvisionedConcurrencySpilloverInvocations', {
            label: 'ProvisionedConcurrencySpilloverInvocations',
            statistic: Statistic.MAXIMUM,
            period: Duration.minutes(1),
          }),
          threshold: 5,
          evaluationPeriods: 3,
          treatMissingData: TreatMissingData.NOT_BREACHING,
        }),
        leftYAxis: {
          min: 0,
          showUnits: false,
        },
      }),
      // Duration
      new AlarmWidget({
        width: 24,
        height: 6,
        title: 'Duration',
        alarm: new Alarm(this, 'FRLMLambdaFunctionDurationAlarm', {
          metric: this.props.lambdaFunction.metricDuration({
            statistic: 'p99',
            label: 'P99',
            period: Duration.minutes(1),
          }),
          threshold: 5000,
          evaluationPeriods: 5,
        }),
        leftYAxis: {
          min: 0,
          label: 'ms',
          showUnits: false,
        },
      }),
    );
  }
}
