# routes/verify.py
from flask import Blueprint, request, jsonify
from firebase_admin import auth, firestore
from app import db  # Assuming your app.py exports Firestore client as db

verify_bp = Blueprint("verify", __name__)

@verify_bp.route("/", methods=["POST"])
def verify_user():
    try:
        auth_header = request.headers.get("Authorization", "")
        print("🔎 Received authHeader:", auth_header)

        if not auth_header or not auth_header.startswith("Bearer "):
            return jsonify({"message": "Missing or invalid token"}), 401

        id_token = auth_header.split(" ")[1]
        print("🔑 Token received:", id_token[:20] + "...")

        # Verify Firebase ID token using admin SDK
        decoded_token = auth.verify_id_token(id_token)
        print("✅ Decoded Token:", decoded_token)

        uid = decoded_token["uid"]

        # Fetch user document from Firestore
        user_ref = db.collection("users").document(uid)
        user_doc = user_ref.get()

        if not user_doc.exists:
            print(f"⚠️ User not found in Firestore: UID={uid}")
            return jsonify({"message": "User not found in database."}), 404

        user_data = user_doc.to_dict()
        role = user_data.get("role", "unknown")

        # Optional: validate role sent from frontend
        frontend_role = request.json.get("role", "").lower() if request.json else None
        if frontend_role and frontend_role != role.lower():
            print(f"⚠️ Role mismatch: frontend={frontend_role}, backend={role}")
            return jsonify({"message": "Role mismatch. Access denied."}), 403

        return jsonify({
            "success": True,
            "uid": uid,
            "email": decoded_token.get("email"),
            "role": role
        })

    except auth.ExpiredIdTokenError:
        return jsonify({"message": "Token expired"}), 401
    except auth.InvalidIdTokenError:
        return jsonify({"message": "Invalid token format"}), 400
    except Exception as e:
        print("❌ Token verification or Firestore error:", e)
        return jsonify({"message": "Invalid or expired token"}), 401
