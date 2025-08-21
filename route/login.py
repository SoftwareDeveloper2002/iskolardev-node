# routes/login.py
from flask import Blueprint, request, jsonify
from firebase_admin import auth, firestore
from app import db  # Import Firestore client from app.py

login_bp = Blueprint("login", __name__)

@login_bp.route("/", methods=["POST"])
def login():
    auth_header = request.headers.get("Authorization", "")
    data = request.json or {}
    expected_role = data.get("expectedRole", "").lower() if data.get("expectedRole") else None

    if not auth_header or not auth_header.startswith("Bearer "):
        return jsonify({"message": "Missing or invalid token"}), 401

    id_token = auth_header.split(" ")[1]

    try:
        # Verify Firebase ID token
        decoded_token = auth.verify_id_token(id_token)
        uid = decoded_token["uid"]

        # Fetch user from Firestore
        user_doc = db.collection("users").document(uid).get()
        if not user_doc.exists:
            return jsonify({"message": "User not found in database."}), 404

        user_data = user_doc.to_dict()
        actual_role = user_data.get("role", "unknown").lower()

        # Role check
        if expected_role and actual_role != expected_role:
            return jsonify({
                "message": f"Unauthorized role: expected {expected_role}, got {actual_role}"
            }), 403

        print(f"✅ User {decoded_token.get('email')} logged in with role={actual_role}")

        # Optional: issue your own JWT here if needed

        return jsonify({
            "success": True,
            "uid": uid,
            "email": decoded_token.get("email"),
            "role": actual_role
        })

    except auth.ExpiredIdTokenError:
        return jsonify({"message": "Token expired"}), 401
    except auth.InvalidIdTokenError:
        return jsonify({"message": "Invalid token format"}), 400
    except Exception as e:
        print("❌ Firebase token verification failed:", e)
        return jsonify({"message": "Invalid or expired token"}), 401
