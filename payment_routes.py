# routes/payment_routes.py
from flask import Blueprint, request, jsonify
import os
import requests
from app import db
from firebase_admin import firestore
from base64 import b64encode
from datetime import datetime

payment_bp = Blueprint("payment", __name__)

# ------------------ PAYMONGO CONFIG ------------------
PAYMONGO_SECRET_KEY = os.environ.get("PAYMONGO_SECRET_KEY", "sk_test_uYAyatPB8sNrDkLispMVrLh4")
AUTH_HEADER = {
    "Authorization": "Basic " + b64encode(f"{PAYMONGO_SECRET_KEY}:".encode()).decode(),
    "Content-Type": "application/json"
}

# ------------------ HELPER ------------------
def pm_post(url, body):
    res = requests.post(url, headers=AUTH_HEADER, json=body)
    data = res.json()
    if not res.ok:
        msg = data.get("errors", [{}])[0].get("detail", str(data))
        raise Exception(f"PayMongo error: {msg}")
    return data

# ------------------ ROUTES ------------------

@payment_bp.route("/<string:payment_type>/intent", methods=["POST"])
def create_payment_intent(payment_type):
    try:
        payment_type = payment_type.lower()
        body = request.json or {}
        amount = body.get("amount")
        billing = body.get("billing", {})

        if not amount or not str(amount).replace(".", "", 1).isdigit():
            return jsonify({"error": "Invalid amount"}), 400

        amount_centavos = round(float(amount) * 100)

        billing_data = {
            "name": billing.get("name", f"{payment_type.upper()} Payer"),
            "email": billing.get("email", "payer@example.com")
        }

        if payment_type == "gcash":
            billing_data["gcashNumber"] = billing.get("phone", "09123456789")
        if payment_type == "grab_pay":
            billing_data["phone"] = billing.get("phone", "09123456789")

        source = pm_post("https://api.paymongo.com/v1/sources", {
            "data": {
                "attributes": {
                    "amount": amount_centavos,
                    "redirect": {
                        "success": "https://iskolardev.online/payment-success",
                        "failed": "https://iskolardev.online/payment-failed"
                    },
                    "type": payment_type,
                    "currency": "PHP",
                    "billing": billing_data
                }
            }
        })

        checkout_url = source.get("data", {}).get("attributes", {}).get("redirect", {}).get("checkout_url")
        source_id = source.get("data", {}).get("id")

        if not checkout_url:
            return jsonify({"error": "Failed to create checkout URL"}), 500

        # Save payment log to Firestore
        db.collection("payments").document(source_id).set({
            "amount": amount,
            "billing": billing,
            "paymentType": payment_type,
            "sourceId": source_id,
            "status": "pending",
            "createdAt": firestore.SERVER_TIMESTAMP
        })

        return jsonify({"checkoutUrl": checkout_url, "sourceId": source_id})

    except Exception as e:
        print(f"❌ Error in /paymongo/{payment_type}/intent:", e)
        return jsonify({"error": str(e) or "Server error"}), 500


@payment_bp.route("/<string:payment_type>/webhook", methods=["POST"])
def webhook(payment_type):
    try:
        body = request.json or {}
        payment_id = body.get("data", {}).get("id")
        event = body.get("data", {}).get("attributes", {}).get("type")

        if not payment_id or not event:
            return "", 400

        update = {}
        if event == "payment.paid":
            update = {"status": "paid", "paidAt": firestore.SERVER_TIMESTAMP}
        elif event == "payment.failed":
            update = {"status": "failed", "failedAt": firestore.SERVER_TIMESTAMP}

        if update:
            db.collection("payments").document(payment_id).set(update, merge=True)

        return "", 200

    except Exception as e:
        print(f"❌ Webhook error for {payment_type}:", e)
        return "", 500
