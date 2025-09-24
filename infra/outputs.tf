output "http_api_invoke_url" {
  description = "API HTTP base URL"
  value       = aws_apigatewayv2_api.http_api.api_endpoint
}

output "http_api_base_url" {
  value = aws_apigatewayv2_api.http_api.api_endpoint
}

output "lambda_names" {
  description = "Deployed lambda functions"
  value = [
    aws_lambda_function.summary.function_name,
    aws_lambda_function.timeline.function_name,
    aws_lambda_function.advice_payload.function_name,
    aws_lambda_function.advice_request.function_name,
    aws_lambda_function.advice_status.function_name,
    aws_lambda_function.advice_worker.function_name
  ]
}

output "dynamodb_table_name" {
  value = aws_dynamodb_table.stori_challenge.name
}

output "advice_routes" {
  value = {
    payload = "${aws_apigatewayv2_api.http_api.api_endpoint}/api/advice/payload"
    request = "${aws_apigatewayv2_api.http_api.api_endpoint}/api/advice"
    status  = "${aws_apigatewayv2_api.http_api.api_endpoint}/api/advice/status"
  }
}

output "advice_queue_url" {
  value = aws_sqs_queue.advice_q.id
}
