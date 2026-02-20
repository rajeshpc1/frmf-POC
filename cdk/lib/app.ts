#!/usr/bin/env node
import { App } from 'aws-cdk-lib';

import {
  DependencyModel,
  DeploymentPipeline,
  GordianKnotScannerApprovalWorkflowStep,
  Platform,
  ScanProfile,
} from '@amzn/pipelines';
import { BrazilPackage } from '@amzn/pipelines';
import { ServiceStack } from './serviceStack';
import { MonitoringStack } from './monitoringStack';
import { DataLakeStack } from './dataLakeStack';
import { ClaudeIntegrationStack } from './claudeIntegrationStack';

// Set up your CDK App
const app = new App();

const applicationAccount = '012258635969';

const pipeline = new DeploymentPipeline(app, 'Pipeline', {
  account: applicationAccount,
  pipelineName: 'FRLM',
  versionSet: {
    name: 'FRLM/Development',
    dependencyModel: DependencyModel.BRAZIL,
  },
  versionSetPlatform: Platform.AL2_X86_64,
  trackingVersionSet: 'live', // Or any other version set you prefer
  bindleGuid: 'amzn1.bindle.resource.2oabhtcdjegtpjxhkhiq',
  description: 'Java Lambda basic pipeline managed by CDK',
  notificationEmailAddress: 'trito@amazon.com',
  pipelineId: '8528383',
  selfMutate: true,
  createLegacyPipelineStage: false,
});

['FRLM', 'FRLMTests'].forEach((pkg) => pipeline.addPackageToAutobuild(BrazilPackage.fromString(pkg)));

pipeline.versionSetStage.addApprovalWorkflow('VersionSet Workflow').addStep(
  new GordianKnotScannerApprovalWorkflowStep({
    platform: Platform.AL2_X86_64, // https://issues.amazon.com/issues/GK-956
    scanProfileName: ScanProfile.ASSERT_LOW,
  }),
);

const stageName = 'alpha';
const alphaStage = pipeline.addStage(stageName, { isProd: false });
const deploymentGroup = alphaStage.addDeploymentGroup({
  name: 'alphaApplication',
});

const env = pipeline.deploymentEnvironmentFor('012258635969', 'us-west-2');

const serviceStack = new ServiceStack(app, `FRLM-Service-${stageName}`, {
  env,
  stage: alphaStage.name,
  isProd: alphaStage.isProd,
});
const monitoringStack = new MonitoringStack(app, `FRLM-Monitoring-${stageName}`, {
  env,
  lambdaFunction: serviceStack.lambdaFunction,
});
const dataLakeStack = new DataLakeStack(app, `FRLM-DataLake-${stageName}`, {
  env,
  stage: alphaStage.name,
});
const claudeStack = new ClaudeIntegrationStack(app, `FRLM-Claude-${stageName}`, {
  env,
  stage: alphaStage.name,
});
deploymentGroup.addStacks(serviceStack, monitoringStack, dataLakeStack, claudeStack);

const hydraApproval = serviceStack.createIntegrationTestsApprovalWorkflowStep('Integration Test', Platform.AL2_X86_64);

alphaStage.addApprovalWorkflow('Approval Workflow', {
  sequence: [hydraApproval],
  requiresConsistentRevisions: true,
});
