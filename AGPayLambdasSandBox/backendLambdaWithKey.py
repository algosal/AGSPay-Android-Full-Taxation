import json
import os
import stripe

# Secret key stored in Lambda environment variables
stripe.api_key = os.environ["STRIPE_SECRET_KEY"]

def lambda_handler(event, context):
    try:
        # Optional: Only allow POST when called from API Gateway
        if isinstance(event, dict) and "httpMethod" in event and event["httpMethod"] != "POST":
            return {
                "statusCode": 405,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Method Not Allowed"}),
            }

        # Create the Stripe Terminal connection token
        token = stripe.terminal.ConnectionToken.create()

        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",   # allow AGPay to call it
            },
            "body": json.dumps({"secret": token.secret}),
        }

    except Exception as e:
        print("ERROR:", e)
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": str(e)}),
        }
