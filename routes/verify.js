// routes/verify.js
import express from "express";
import { db, admin } from "../firebase.js";

const router = express.Router();

/**
 * POST /auth/verify
 * Frontend sends Authorization: Bearer <Firebase ID Token>
 */
router.post("/", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    console.log("🔎 Received authHeader:", authHeader);

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Missing or invalid token" });
    }

    const idToken = authHeader.split(" ")[1];
    console.log("🔑 Token received:", idToken.substring(0, 20) + "...");

    // Verify Firebase ID token using admin SDK
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    console.log("✅ Decoded Token:", decodedToken);

    const uid = decodedToken.uid;

    // Fetch user document from Firestore using admin credentials
    const userRef = db.collection("users").doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      console.warn(`⚠️ User not found in Firestore: UID=${uid}`);
      return res.status(404).json({ message: "User not found in database." });
    }

    const userData = userDoc.data();
    const role = userData.role || "unknown";

    // Optional: validate role sent from frontend
    const frontendRole = req.body.role?.toLowerCase();
    if (frontendRole && frontendRole !== role.toLowerCase()) {
      console.warn(`⚠️ Role mismatch: frontend=${frontendRole}, backend=${role}`);
      return res.status(403).json({ message: "Role mismatch. Access denied." });
    }

    return res.json({
      success: true,
      uid,
      email: decodedToken.email,
      role,
    });

  } catch (err) {
    console.error("❌ Token verification or Firestore error:", err);

    // Differentiate errors
    if (err.code === "auth/id-token-expired") {
      return res.status(401).json({ message: "Token expired" });
    }
    if (err.code === "auth/argument-error") {
      return res.status(400).json({ message: "Invalid token format" });
    }

    return res.status(401).json({ message: "Invalid or expired token" });
  }
});

export default router;
