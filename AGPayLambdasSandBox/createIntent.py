# lambda_function.py
import json
import os
import stripe

# Set this in Lambda env: STRIPE_SECRET_KEY = sk_test_...
stripe.api_key = os.environ["STRIPE_SECRET_KEY"]


def lambda_handler(event, context):
    """
    This Lambda ONLY creates a Stripe Terminal PaymentIntent.

    It expects API Gateway to already be mapped to:
      POST /Stripe/stripe/create-intent  -> this Lambda

    Body JSON (from app/Postman):
      {
        "amount": 1000,   # cents (e.g. 1000 = $10)
        "currency": "usd" # optional, defaults to "usd"
      }
    """

    print("Incoming event:", json.dumps(event))

    # --- Parse JSON body safely ---
    raw_body = event.get("body") or "{}"
    try:
        if isinstance(raw_body, str):
            body = json.loads(raw_body)
        else:
            body = raw_body
    except Exception:
        body = {}

    # --- Read amount & currency ---
    amount = int(body.get("amount"))
    currency = body.get("currency", "usd")

    print(f"Creating Terminal PaymentIntent: amount={amount}, currency={currency}")

    try:
        # IMPORTANT: card_present is required for Stripe Terminal
        pi = stripe.PaymentIntent.create(
            amount=amount,
            currency=currency,
            payment_method_types=["card_present"],
            capture_method="automatic",
        )

        response_body = {"client_secret": pi.client_secret}

        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Methods": "*",
            },
            "body": json.dumps(response_body),
        }

    except Exception as e:
        print("Error creating PaymentIntent:", e)
        error_body = {"error": str(e)}
        return {
            "statusCode": 500,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Methods": "*",
            },
            "body": json.dumps(error_body),
        }
