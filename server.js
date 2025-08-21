// server.js
import express from "express";
import cors from "cors";
import "dotenv/config";
import { db, admin } from "./firebase.js";
import paymentRoutes from "./payment_routes.js";
import loginRoute from "./routes/login.js";
import verifyRoutes from "./routes/verify.js";

/* ------------------ EXPRESS INIT ------------------ */
const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

/* ------------------ MAINTENANCE MODE ------------------ */
const maintenanceMode = process.env.MAINTENANCE_MODE === "true";

app.use((req, res, next) => {
  if (maintenanceMode) {
    return res.status(503).json({
      status: "maintenance",
      message: "🚧 The system is currently under maintenance. Please try again later.",
      timestamp: new Date().toISOString(),
    });
  }
  next();
});

/* ------------------ TOKEN VERIFICATION HELPER ------------------ */
async function verifyToken(idToken) {
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    console.log("✅ Token verified:", decodedToken.uid);
    return decodedToken.uid;
  } catch (error) {
    console.error("❌ Token verification failed:", error);
    throw new Error("Unauthorized");
  }
}

/* ------------------ ROUTES ------------------ */
app.get("/", (req, res) => res.send("There is nothing to see here."));

// Test Firestore (protected example)
app.get("/test-firestore", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }

  const idToken = authHeader.split(" ")[1];
  try {
    const uid = await verifyToken(idToken); // verify token first

    await db.collection("payments").doc("amount").set({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      uid,
    });

    res.json({ status: "success ✅ Firestore write worked", uid });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

/* ------------------ PAYMENT & AUTH ROUTES ------------------ */
app.use("/paymongo", paymentRoutes);
app.use("/auth/login", loginRoute);
app.use("/auth/verify", verifyRoutes);

/* ------------------ CHECK FIREBASE ADMIN ------------------ */
async function checkFirebaseAdmin() {
  try {
    // Quick Firestore read to test credentials
    await db.collection("payments").limit(1).get();
    console.log("✅ Firebase Admin SDK initialized successfully");
    return true;
  } catch (err) {
    console.error("❌ Firebase Admin SDK initialization failed:", err);
    return false;
  }
}

/* ------------------ SERVER ------------------ */
const PORT = process.env.PORT || 8000;

checkFirebaseAdmin().then((ok) => {
  if (!ok) {
    console.error("❌ Exiting: Firebase Admin SDK not working.");
    process.exit(1); // stop server if Firebase can't be accessed
  }

  app.listen(PORT, () =>
    console.log(
      `✅ Server running on http://localhost:${PORT} | Maintenance Mode: ${maintenanceMode}`
    )
  );
});
