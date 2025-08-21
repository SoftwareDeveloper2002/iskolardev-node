# app.py
from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import firebase_admin
from firebase_admin import credentials, auth, firestore
from datetime import datetime
from base64 import b64encode
import requests

# ------------------ FIREBASE ADMIN INIT ------------------
cred = credentials.Certificate("sdk.json")  # your service account JSON
firebase_admin.initialize_app(cred)
db = firestore.client()

# ------------------ FLASK INIT ------------------
app = Flask(__name__)
CORS(app)  # allow all origins

# ------------------ MAINTENANCE MODE ------------------
MAINTENANCE_MODE = os.environ.get("MAINTENANCE_MODE", "false").lower() == "true"

@app.before_request
def check_maintenance():
    if MAINTENANCE_MODE:
        return jsonify({
            "status": "maintenance",
            "message": "🚧 The system is currently under maintenance. Please try again later.",
            "timestamp": datetime.utcnow().isoformat()
        }), 503

# ------------------ TOKEN VERIFICATION HELPER ------------------
def verify_token(id_token):
    try:
        decoded_token = auth.verify_id_token(id_token)
        print(f"✅ Token verified: {decoded_token['uid']}")
        return decoded_token
    except Exception as e:
        print(f"❌ Token verification failed: {e}")
        raise

# ------------------ PAYMONGO CONFIG ------------------
PAYMONGO_SECRET_KEY = os.environ.get("PAYMONGO_SECRET_KEY", "sk_test_uYAyatPB8sNrDkLispMVrLh4")
AUTH_HEADER = {
    "Authorization": "Basic " + b64encode(f"{PAYMONGO_SECRET_KEY}:".encode()).decode(),
    "Content-Type": "application/json"
}

def pm_post(url, body):
    res = requests.post(url, headers=AUTH_HEADER, json=body)
    data = res.json()
    if not res.ok:
        msg = data.get("errors", [{}])[0].get("detail", str(data))
        raise Exception(f"PayMongo error: {msg}")
    return data

# ------------------ ROUTES ------------------
@app.route("/")
def home():
    return "There is nothing to see here."

# Test Firestore (protected example)
@app.route("/test-firestore", methods=["GET"])
def test_firestore():
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return jsonify({"error": "No token provided"}), 401

    id_token = auth_header.split(" ")[1]
    try:
        decoded_token = verify_token(id_token)
        uid = decoded_token["uid"]
        db.collection("payments").document("amount").set({
            "timestamp": firestore.SERVER_TIMESTAMP,
            "uid": uid
        })
        return jsonify({"status": "success ✅ Firestore write worked", "uid": uid})
    except Exception as e:
        return jsonify({"error": str(e)}), 401

# ------------------ AUTH ROUTES ------------------
@app.route("/auth/verify", methods=["POST"])
def verify_route():
    try:
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return jsonify({"message": "Missing or invalid token"}), 401

        id_token = auth_header.split(" ")[1]
        decoded_token = verify_token(id_token)
        uid = decoded_token["uid"]

        user_doc = db.collection("users").document(uid).get()
        if not user_doc.exists:
            return jsonify({"message": "User not found in database."}), 404

        user_data = user_doc.to_dict()
        role = user_data.get("role", "unknown")

        frontend_role = request.json.get("role", "").lower() if request.json else None
        if frontend_role and frontend_role != role.lower():
            return jsonify({"message": "Role mismatch. Access denied."}), 403

        return jsonify({
            "success": True,
            "uid": uid,
            "email": decoded_token.get("email"),
            "role": role
        })

    except Exception as e:
        print("❌ Token verification or Firestore error:", e)
        return jsonify({"message": "Invalid or expired token"}), 401

@app.route("/auth/login", methods=["POST"])
def login_route():
    try:
        auth_header = request.headers.get("Authorization")
        expected_role = request.json.get("expectedRole") if request.json else None

        if not auth_header or not auth_header.startswith("Bearer "):
            return jsonify({"message": "Missing or invalid token"}), 401

        id_token = auth_header.split(" ")[1]
        decoded_token = verify_token(id_token)
        uid = decoded_token["uid"]

        user_doc = db.collection("users").document(uid).get()
        if not user_doc.exists:
            return jsonify({"message": "User not found in database."}), 404

        user_data = user_doc.to_dict()
        actual_role = user_data.get("role", "unknown").lower()

        if expected_role and actual_role != expected_role.lower():
            return jsonify({"message": f"Unauthorized role: expected {expected_role}, got {actual_role}"}), 403

        return jsonify({
            "success": True,
            "uid": uid,
            "email": decoded_token.get("email"),
            "role": actual_role
        })

    except Exception as e:
        print("❌ Firebase token verification failed:", e)
        return jsonify({"message": "Invalid token"}), 401

# ------------------ PAYMENT ROUTES ------------------
@app.route("/paymongo/<string:payment_type>/intent", methods=["POST"])
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
        return jsonify({"error": str(e)}), 500

@app.route("/paymongo/<string:payment_type>/webhook", methods=["POST"])
def payment_webhook(payment_type):
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

# ------------------ CHECK FIREBASE ADMIN ------------------
def check_firebase_admin():
    try:
        docs = db.collection("payments").limit(1).get()
        print("✅ Firebase Admin SDK initialized successfully")
        return True
    except Exception as e:
        print("❌ Firebase Admin SDK initialization failed:", e)
        return False

# ------------------ RUN SERVER ------------------
if __name__ == "__main__":
    if not check_firebase_admin():
        print("❌ Exiting: Firebase Admin SDK not working.")
        exit(1)

    PORT = int(os.environ.get("PORT", 8000))
    app.run(host="0.0.0.0", port=PORT, debug=True)
