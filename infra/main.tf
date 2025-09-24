# Provider configuration
provider "aws" {
  region = var.aws_region

  # Apply these tags to every taggable AWS resource
  default_tags {
    tags = {
      project    = "stori-challenge"
      created_by = "terraform"
    }
  }
}

# Local naming prefix to keep resources grouped and easy to identify/destroy
locals {
  name_prefix  = var.project_name
  lambda_funcs = ["summary", "timeline", "advice"]
}

# -------------------------------------------
# Package Lambda functions from local folders
# -------------------------------------------
data "archive_file" "summary_zip" {
  type        = "zip"
  source_dir  = "${path.module}/lambdas/summary"
  output_path = "${path.module}/build/summary.zip"

  depends_on = [null_resource.sync_shared["summary"]]
}

data "archive_file" "timeline_zip" {
  type        = "zip"
  source_dir  = "${path.module}/lambdas/timeline"
  output_path = "${path.module}/build/timeline.zip"

  depends_on = [null_resource.sync_shared["timeline"]]
}

data "archive_file" "advice_zip" {
  type        = "zip"
  source_dir  = "${path.module}/lambdas/advice"
  output_path = "${path.module}/build/advice.zip"

  depends_on = [null_resource.sync_shared["advice"]]
}
# -------------------------------------------
# IAM role for Lambda execution with basic logging
# -------------------------------------------
data "aws_iam_policy_document" "assume_lambda" {
  statement {
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
    actions = ["sts:AssumeRole"]
  }
}

resource "aws_iam_role" "lambda_exec" {
  name               = "${local.name_prefix}-lambda-role"
  assume_role_policy = data.aws_iam_policy_document.assume_lambda.json
}

resource "aws_iam_role" "lambda_exec_advice" {
  name               = "${local.name_prefix}-lambda-role-advice"
  assume_role_policy = data.aws_iam_policy_document.assume_lambda.json
}

resource "aws_iam_role_policy_attachment" "lambda_logs" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "advice_lambda_logs" {
  role       = aws_iam_role.lambda_exec_advice.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

## SQS for advice lambda
resource "aws_sqs_queue" "advice_q" {
  name                       = "${local.name_prefix}-advice-q"
  visibility_timeout_seconds = 300

}

resource "aws_iam_role_policy" "advice_sqs_send" {
  name = "advice-sqs-send"
  role = aws_iam_role.lambda_exec_advice.id
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect : "Allow",
      Action : ["sqs:SendMessage"],
      Resource : aws_sqs_queue.advice_q.arn
    }]
  })
}

resource "aws_iam_role_policy" "advice_sqs_consume" {
  name = "advice-sqs-consume"
  role = aws_iam_role.lambda_exec_advice.id
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect : "Allow",
      Action : ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"],
      Resource : aws_sqs_queue.advice_q.arn
    }]
  })
}

# -------------------------------------------
# Lambda functions (Node.js 20)
# Keep each endpoint isolated for better observability and least-privilege IAM
# -------------------------------------------

# --- LAYER (SDK Dynamo) ---
resource "null_resource" "layer_deps" {
  triggers = {
    lock_hash = filesha256("${path.module}/layers/dynamo/nodejs/package-lock.json")
  }
  provisioner "local-exec" {
    working_dir = "${path.module}/layers/dynamo/nodejs"
    command     = "npm ci || npm i"
  }
}

data "archive_file" "dynamo_layer_zip" {
  type        = "zip"
  source_dir  = "${path.module}/layers/dynamo"
  output_path = "${path.module}/build/dynamo-layer.zip"

  depends_on = [null_resource.layer_deps]
}

resource "aws_lambda_layer_version" "dynamo" {
  layer_name          = "stori-dynamo-sdk"
  filename            = data.archive_file.dynamo_layer_zip.output_path
  source_code_hash    = data.archive_file.dynamo_layer_zip.output_base64sha256
  compatible_runtimes = ["nodejs20.x"]
  description         = "AWS SDK v3 for DynamoDB shared"
}

## --- SHARED ---
resource "null_resource" "sync_shared" {
  for_each = toset(local.lambda_funcs)

  triggers = {
    shared_hash = jsonencode({
      for f in fileset("${path.module}/lambdas/_shared", "**") :
      f => filesha256("${path.module}/lambdas/_shared/${f}")
    })
  }

  provisioner "local-exec" {
    command = "rm -rf ${path.module}/lambdas/${each.value}/_shared && cp -R ${path.module}/lambdas/_shared ${path.module}/lambdas/${each.value}/_shared"
  }
}

resource "aws_lambda_function" "summary" {
  function_name    = "${local.name_prefix}-summary"
  role             = aws_iam_role.lambda_exec.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.summary_zip.output_path
  source_code_hash = data.archive_file.summary_zip.output_base64sha256
  timeout          = var.lambda_timeout_s
  memory_size      = var.lambda_memory_mb

  layers = [aws_lambda_layer_version.dynamo.arn]

  environment {
    variables = {
      TABLE_NAME = aws_dynamodb_table.stori_challenge.name
    }
  }
}

resource "aws_lambda_function" "timeline" {
  function_name    = "${local.name_prefix}-timeline"
  role             = aws_iam_role.lambda_exec.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.timeline_zip.output_path
  source_code_hash = data.archive_file.timeline_zip.output_base64sha256
  timeout          = var.lambda_timeout_s
  memory_size      = var.lambda_memory_mb

  layers = [aws_lambda_layer_version.dynamo.arn]

  environment {
    variables = {
      TABLE_NAME = aws_dynamodb_table.stori_challenge.name
    }
  }
}

# GET /api/advice/payload
resource "aws_lambda_function" "advice_payload" {
  function_name    = "${local.name_prefix}-advice-payload"
  role             = aws_iam_role.lambda_exec_advice.arn
  runtime          = "nodejs20.x"
  handler          = "index.payloadHandler"
  filename         = data.archive_file.advice_zip.output_path
  source_code_hash = data.archive_file.advice_zip.output_base64sha256
  timeout          = 10
  memory_size      = 512
  layers           = [aws_lambda_layer_version.dynamo.arn]
  environment {
    variables = {
      TABLE_NAME = aws_dynamodb_table.stori_challenge.name
    }
  }
}

# POST /api/advice (crear job)
resource "aws_lambda_function" "advice_request" {
  function_name    = "${local.name_prefix}-advice-request"
  role             = aws_iam_role.lambda_exec_advice.arn
  runtime          = "nodejs20.x"
  handler          = "index.requestHandler"
  filename         = data.archive_file.advice_zip.output_path
  source_code_hash = data.archive_file.advice_zip.output_base64sha256
  timeout          = 5
  memory_size      = 512
  layers           = [aws_lambda_layer_version.dynamo.arn]
  environment {
    variables = {
      TABLE_NAME       = aws_dynamodb_table.stori_challenge.name
      ADVICE_QUEUE_URL = aws_sqs_queue.advice_q.id
    }
  }
}

# GET /api/advice/status
resource "aws_lambda_function" "advice_status" {
  function_name    = "${local.name_prefix}-advice-status"
  role             = aws_iam_role.lambda_exec_advice.arn
  runtime          = "nodejs20.x"
  handler          = "index.statusHandler"
  filename         = data.archive_file.advice_zip.output_path
  source_code_hash = data.archive_file.advice_zip.output_base64sha256
  timeout          = 5
  memory_size      = 512
  layers           = [aws_lambda_layer_version.dynamo.arn]
  environment {
    variables = {
      TABLE_NAME = aws_dynamodb_table.stori_challenge.name
    }
  }
}

# Worker SQS (Bedrock)
resource "aws_lambda_function" "advice_worker" {
  function_name    = "${local.name_prefix}-advice-worker"
  role             = aws_iam_role.lambda_exec_advice.arn
  runtime          = "nodejs20.x"
  handler          = "worker.handler"
  filename         = data.archive_file.advice_zip.output_path
  source_code_hash = data.archive_file.advice_zip.output_base64sha256
  timeout          = 400
  memory_size      = 1536
  layers           = [aws_lambda_layer_version.dynamo.arn]
  environment {
    variables = {
      TABLE_NAME          = aws_dynamodb_table.stori_challenge.name
      BEDROCK_MODEL_ID    = "openai.gpt-oss-20b-1:0"
      BEDROCK_MAX_TOKENS  = "2588"
      BEDROCK_TEMPERATURE = "0.3"
    }
  }
}

resource "aws_lambda_event_source_mapping" "advice_sqs_trigger" {
  event_source_arn = aws_sqs_queue.advice_q.arn
  function_name    = aws_lambda_function.advice_worker.arn
  batch_size       = 1
}

resource "aws_iam_role_policy" "advice_bedrock" {
  name = "advice-bedrock-invoke"
  role = aws_iam_role.lambda_exec_advice.id
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Sid      = "BedrockInvoke",
      Effect   = "Allow",
      Action   = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
      Resource = "*"
    }]
  })
}

# --- DynamoDB table (Provisioned 5/5 -> Free Tier) ---
resource "aws_dynamodb_table" "stori_challenge" {
  name         = "stori_challenge_transactions"
  billing_mode = "PROVISIONED"

  read_capacity  = 5
  write_capacity = 5

  hash_key  = "pk"
  range_key = "sk"

  attribute {
    name = "pk"
    type = "S"
  }
  attribute {
    name = "sk"
    type = "S"
  }

  deletion_protection_enabled = true
}

# Policy to allow Lambdas to read/write the table
data "aws_iam_policy_document" "stori_challenge_table_access" {
  statement {
    actions = [
      "dynamodb:Query",
      "dynamodb:Scan",
      "dynamodb:BatchWriteItem",
      "dynamodb:PutItem",
      "dynamodb:GetItem",
      "dynamodb:UpdateItem"
    ]
    resources = [aws_dynamodb_table.stori_challenge.arn]
  }
}

resource "aws_iam_policy" "stori_challenge_table_access" {
  name   = "stori-challenge-table-access"
  policy = data.aws_iam_policy_document.stori_challenge_table_access.json
}

resource "aws_iam_role_policy_attachment" "attach_stori_challenge_table_access" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = aws_iam_policy.stori_challenge_table_access.arn
}

resource "aws_iam_role_policy_attachment" "advice_table_access" {
  role       = aws_iam_role.lambda_exec_advice.name
  policy_arn = aws_iam_policy.stori_challenge_table_access.arn
}


# -------------------------------------------
# CloudWatch log groups with retention
# -------------------------------------------
resource "aws_cloudwatch_log_group" "lg_summary" {
  name              = "/aws/lambda/${aws_lambda_function.summary.function_name}"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_group" "lg_timeline" {
  name              = "/aws/lambda/${aws_lambda_function.timeline.function_name}"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_group" "lg_advice_payload" {
  name              = "/aws/lambda/${aws_lambda_function.advice_payload.function_name}"
  retention_in_days = var.log_retention_days
}
resource "aws_cloudwatch_log_group" "lg_advice_request" {
  name              = "/aws/lambda/${aws_lambda_function.advice_request.function_name}"
  retention_in_days = var.log_retention_days
}
resource "aws_cloudwatch_log_group" "lg_advice_status" {
  name              = "/aws/lambda/${aws_lambda_function.advice_status.function_name}"
  retention_in_days = var.log_retention_days
}
resource "aws_cloudwatch_log_group" "lg_advice_worker" {
  name              = "/aws/lambda/${aws_lambda_function.advice_worker.function_name}"
  retention_in_days = var.log_retention_days
}

# Log group API Gateway
resource "aws_cloudwatch_log_group" "apigw_access" {
  name              = "/aws/apigw/${local.name_prefix}"
  retention_in_days = var.log_retention_days
}

# -------------------------------------------
# API Gateway HTTP API (v2) with CORS
# -------------------------------------------
resource "aws_apigatewayv2_api" "http_api" {
  name          = "${local.name_prefix}-http-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_headers     = ["content-type", "authorization", "accept", "x-requested-with", "x-api-key", "x-ai-mode"]
    allow_methods     = ["GET", "POST", "OPTIONS"]
    allow_origins     = var.cors_allowed_origins
    expose_headers    = ["content-type"]
    max_age           = 86400
    allow_credentials = false
  }
}

# Lambda proxy integrations
resource "aws_apigatewayv2_integration" "i_summary" {
  api_id                 = aws_apigatewayv2_api.http_api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.summary.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "i_timeline" {
  api_id                 = aws_apigatewayv2_api.http_api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.timeline.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "i_advice_payload" {
  api_id                 = aws_apigatewayv2_api.http_api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.advice_payload.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "i_advice_request" {
  api_id                 = aws_apigatewayv2_api.http_api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.advice_request.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "i_advice_status" {
  api_id                 = aws_apigatewayv2_api.http_api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.advice_status.invoke_arn
  payload_format_version = "2.0"
}

# Explicit routes for each endpoint
resource "aws_apigatewayv2_route" "r_summary" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "GET /api/summary"
  target    = "integrations/${aws_apigatewayv2_integration.i_summary.id}"
}

resource "aws_apigatewayv2_route" "r_timeline" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "GET /api/timeline"
  target    = "integrations/${aws_apigatewayv2_integration.i_timeline.id}"
}

resource "aws_apigatewayv2_route" "r_advice_payload" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "GET /api/advice/payload"
  target    = "integrations/${aws_apigatewayv2_integration.i_advice_payload.id}"
}

resource "aws_apigatewayv2_route" "r_advice" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "POST /api/advice"
  target    = "integrations/${aws_apigatewayv2_integration.i_advice_request.id}"
}

resource "aws_apigatewayv2_route" "r_advice_status" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "GET /api/advice/status"
  target    = "integrations/${aws_apigatewayv2_integration.i_advice_status.id}"
}

resource "aws_lambda_permission" "allow_apigw_advice_payload" {
  statement_id  = "AllowAPIGatewayInvokeAdvicePayload"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.advice_payload.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http_api.execution_arn}/*/*"
}
resource "aws_lambda_permission" "allow_apigw_advice_request" {
  statement_id  = "AllowAPIGatewayInvokeAdviceRequest"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.advice_request.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http_api.execution_arn}/*/*"
}
resource "aws_lambda_permission" "allow_apigw_advice_status" {
  statement_id  = "AllowAPIGatewayInvokeAdviceStatus"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.advice_status.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http_api.execution_arn}/*/*"
}

# Default stage with auto-deploy (no manual releases required)
resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.http_api.id
  name        = "$default"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.apigw_access.arn
    format = jsonencode({
      requestId               = "$context.requestId",
      ip                      = "$context.identity.sourceIp",
      requestTime             = "$context.requestTime",
      httpMethod              = "$context.httpMethod",
      routeKey                = "$context.routeKey",
      status                  = "$context.status",
      protocol                = "$context.protocol",
      responseLength          = "$context.responseLength",
      integrationStatus       = "$context.integrationStatus",
      integrationErrorMessage = "$context.integrationErrorMessage",
      errorMessage            = "$context.error.message",
      errorResponseType       = "$context.error.responseType",
      userAgent               = "$context.identity.userAgent"
    })
  }
}

# Allow API Gateway to invoke each Lambda (least-privilege per function)
resource "aws_lambda_permission" "allow_apigw_summary" {
  statement_id  = "AllowAPIGatewayInvokeSummary"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.summary.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http_api.execution_arn}/*/*"
}

resource "aws_lambda_permission" "allow_apigw_timeline" {
  statement_id  = "AllowAPIGatewayInvokeTimeline"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.timeline.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http_api.execution_arn}/*/*"
}
