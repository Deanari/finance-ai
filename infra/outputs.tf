output "http_api_invoke_url" {
  description = "API HTTP base URL"
  value       = aws_apigatewayv2_api.http_api.api_endpoint
}

output "lambda_names" {
  description = "Deployed lambda functions"
  value = [
    aws_lambda_function.summary.function_name,
    aws_lambda_function.timeline.function_name,
    aws_lambda_function.advice.function_name
  ]
}

output "dynamodb_table_name" {
  value = aws_dynamodb_table.stori_challenge.name
}