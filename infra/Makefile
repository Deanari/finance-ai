# Makefile for Terraform workflow (API Gateway + Lambdas)
# Usage:
#   make whoami   -> check AWS identity for the active profile
#   make up       -> init + plan + apply + outputs
#   make test     -> curl the API endpoints (summary/timeline/advice)
#   make down     -> destroy + clean

# Default AWS profile (override with: `make up AWS_PROFILE=other`)
AWS_PROFILE ?= stori-mvp
export AWS_PROFILE

# Default region for CLI tooling (Terraform still uses var.aws_region)
REGION ?= us-east-1
export AWS_DEFAULT_REGION=$(REGION)

# Extra flags for terraform plan (e.g., TF_FLAGS='-var aws_region=us-east-2')
TF_FLAGS ?=

.PHONY: hooks whoami init plan apply outputs up test destroy clean down fmt validate

hooks:
	@git config --local core.hooksPath infra/.githooks || true
	@chmod +x infra/.githooks/pre-commit 2>/dev/null || true
	@echo "Git hooks configured (if present)."

whoami:
	@echo "Using AWS_PROFILE=$(AWS_PROFILE)"
	@aws sts get-caller-identity

init:
	terraform init

fmt:
	terraform fmt -recursive

validate:
	@if [ -d .terraform ]; then terraform validate; else echo "Skip validate (run 'make init' first)"; fi

plan: fmt
	@mkdir -p build
	terraform plan -out tfplan $(TF_FLAGS)

apply:
	terraform apply tfplan

outputs:
	terraform output

up: init plan apply outputs

test:
	@API=$$(terraform output -raw http_api_invoke_url); \
	echo "API=$$API"; \
	echo "→ GET /api/summary"; \
	curl -s $$API/api/summary | jq .; \
	echo "→ GET /api/timeline?from=2024-01-01&to=2024-12-31"; \
	curl -s "$$API/api/timeline?from=2024-01-01&to=2024-12-31" | jq .; \
	echo "→ POST /api/advice"; \
	curl -s -X POST $$API/api/advice -H 'Content-Type: application/json' -d '{}' | jq .

destroy:
	terraform destroy -auto-approve

clean:
	rm -f tfplan

down: destroy clean


logs-summary:
	aws logs tail "/aws/lambda/stori-mvp-summary" --since 1h --follow --profile $(AWS_PROFILE)

logs-timeline:
	aws logs tail "/aws/lambda/stori-mvp-timeline" --since 1h --follow --profile $(AWS_PROFILE)

logs-advice:
	aws logs tail "/aws/lambda/stori-mvp-advice" --since 1h --follow --profile $(AWS_PROFILE)

logs-apigw:
	aws logs tail "/aws/apigw/stori-mvp" --since 1h --follow --profile $(AWS_PROFILE)
