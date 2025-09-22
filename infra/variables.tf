variable "aws_region" {
  description = "AWS region to deploy the stack (e.g., us-east-1)."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Resource name prefix to keep everything grouped and easy to destroy."
  type        = string
  default     = "stori-mvp"
}

variable "lambda_memory_mb" {
  description = "Memory size (MB) for each Lambda function."
  type        = number
  default     = 256
}

variable "lambda_timeout_s" {
  description = "Timeout (seconds) for each Lambda function."
  type        = number
  default     = 10
}

variable "log_retention_days" {
  description = "CloudWatch Logs retention in days for each Lambda's log group."
  type        = number
  default     = 14
}

variable "cors_allowed_origins" {
  description = "List of allowed origins for CORS on API Gateway."
  type        = list(string)
  default     = ["*"]
}
