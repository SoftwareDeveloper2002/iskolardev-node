// server.js
import express from "express";
import cors from "cors";
import "dotenv/config";
import { db, admin } from "./firebase_admin.js"; 
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

/* ------------------ ROUTES ------------------ */
app.get('/', (req, res) => res.send('There is nothing to see here.'));
// Test Firestore
app.get("/test-firestore", async (req, res) => {
  try {
    await db.collection("test").doc("demo").set({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.json({ status: "success ✅ Firestore write worked" });
  } catch (err) {
    console.error("Firestore auth failed:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ------------------ PAYMENT ROUTES ------------------ */
app.use("/paymongo", paymentRoutes);
app.use("/auth/login", loginRoute);
app.use("/auth/verify", verifyRoutes);
/* ------------------ SERVER ------------------ */
const PORT = process.env.PORT || 8000;
app.listen(PORT, () =>
  console.log(`✅ Server running on http://localhost:${PORT} | Maintenance Mode: ${maintenanceMode}`)
);
