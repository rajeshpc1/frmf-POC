## Welcome!

This package will help you manage Pipelines and your AWS Infrastructure with the power of CDK!

You can view this package's pipeline, [FRLM](https://pipelines.amazon.com/pipelines/FRLM)

## Development

```bash
brazil ws create --name FRLM
cd FRLM
brazil ws use \
  --versionset FRLM/Development \
  --package FRLMCDK
cd src/FRLMCDK
brazil-build
```

## Useful links:

- https://builderhub.corp.amazon.com/docs/native-aws/developer-guide/cdk-pipeline.html
- https://code.amazon.com/packages/PipelinesConstructs/blobs/mainline/--/README.md
- https://code.amazon.com/packages/CDKBuild/blobs/HEAD/--/README.md
- https://docs.aws.amazon.com/cdk/api/latest/versions.html
