// routes/login.js
import express from "express";
import { db, admin } from "../firebase.js"; // ✅ make sure firebase_admin.js exports admin too

const router = express.Router();

/**
 * POST /auth/login
 * Client should send Authorization: Bearer <Firebase ID Token>
 * and the role (expectedRole) from frontend
 */
router.post("/", async (req, res) => {
  const authHeader = req.headers.authorization;
  const { expectedRole } = req.body;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing or invalid token" });
  }

  const idToken = authHeader.split(" ")[1];

  try {
    // ✅ Verify Firebase ID token
    
    // ✅ Fetch user role from Firestore
    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({ message: "User not found in database." });
    }

    const userData = userDoc.data();
    const actualRole = userData.role?.toLowerCase() || "unknown";

    // ✅ Role check
    if (expectedRole && actualRole !== expectedRole.toLowerCase()) {
      return res.status(403).json({ message: `Unauthorized role: expected ${expectedRole}, got ${actualRole}` });
    }

    console.log(`✅ User ${decodedToken.email} logged in with role=${actualRole}`);

    // You can still issue your own JWT if needed (optional)
    // const token = jwt.sign({ uid, role: actualRole }, process.env.JWT_SECRET, { expiresIn: "1h" });

    return res.json({ 
      success: true,
      uid, 
      email: decodedToken.email, 
      role: actualRole 
      // token  // include this if you still want your own JWT
    });

  } catch (err) {
    console.error("❌ Firebase token verification failed:", err);
    return res.status(401).json({ message: "asdadasd" });
  }
});

export default router;
