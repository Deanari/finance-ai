# Infra (Terraform) — API Gateway + 3 Lambdas

Infrastructure for a minimal backend hosted on AWS:
- **API Gateway (HTTP API v2)** with explicit routes
- **Three Lambda functions** (Node.js 20): `summary`, `timeline`, `advice`
- **CloudWatch Logs** with retention
- **CORS** enabled for GET/POST/OPTIONS

## Prerequisites
- Terraform >= 1.6
- AWS credentials configured (env vars or named profile)

## Repository layout


## Deploy
```bash
terraform init
terraform plan -out tfplan
terraform apply tfplan
```

## Destroy 
```terraform destroy```