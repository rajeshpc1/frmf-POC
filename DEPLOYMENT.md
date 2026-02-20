# FRMF Deployment Guide

## Quick Start
```bash
# 1. Clone repository
git clone https://github.com/YOUR_USERNAME/frmf-phase1.git
cd frmf-phase1

# 2. Deploy infrastructure
cd cdk
npm install
cdk deploy --all

# 3. Get portal URL
aws s3 presign s3://bt101-frmf-portal-ACCOUNT/index.html --expires-in 3600 --region us-west-2
```

## Demo Script
```bash
# Submit request via portal, then:
aws lambda invoke --function-name bt101-batch-processor-alpha --region us-west-2 result.json
```

## Key Components
- **Lambda**: 16 functions in `lambda/` directory
- **Portal**: `web/frmf-portal.html` 
- **CDK**: Infrastructure in `cdk/` directory
- **Demo**: JSON files for testing

## Success Metrics
- 100% processing success rate
- 80-90% duplicate detection confidence
- 92% processing time improvement