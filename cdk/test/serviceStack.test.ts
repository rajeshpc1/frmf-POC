import { Template } from 'aws-cdk-lib/assertions';
import { DeploymentEnvironmentFactory } from '@amzn/pipelines';
import { App } from 'aws-cdk-lib';
import { ServiceStack } from '../lib/serviceStack';

test('create expected Service Resources', () => {
  const mockApp = new App();
  const stack = new ServiceStack(mockApp, 'id', {
    stage: 'Prod',
    isProd: true,
    env: DeploymentEnvironmentFactory.fromAccountAndRegion('test-account', 'us-west-2', 'unique-id'),
  });
  const template = Template.fromStack(stack);
  template.hasResource('AWS::Lambda::Function', {});
});
