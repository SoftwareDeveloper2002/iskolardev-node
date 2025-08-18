// server.js
import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import "dotenv/config";
import admin from "firebase-admin";

/* ------------------ FIREBASE INIT ------------------ */
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}
const db = admin.firestore();

/* ------------------ EXPRESS INIT ------------------ */
const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

/* ------------------ PAYMONGO CONFIG ------------------ */
const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY;
if (!PAYMONGO_SECRET_KEY) {
  console.error("❌ Missing PAYMONGO_SECRET_KEY in .env");
  process.exit(1);
}

const authHeader = {
  Authorization:
    "Basic " + Buffer.from(PAYMONGO_SECRET_KEY + ":").toString("base64"),
  "Content-Type": "application/json",
};

/* ------------------ HELPERS ------------------ */
async function pmPost(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: authHeader,
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error("❌ PayMongo error response:", data); // 👈 log full response
    const msg = data?.errors?.[0]?.detail || JSON.stringify(data);
    throw new Error(`PayMongo error: ${msg}`);
  }
  return data;
}

/* ------------------ ROUTES ------------------ */

/**
 * Create GCash Source (checkout link)
 */
app.post("/paymongo/gcash/intent", async (req, res) => {
  try {
    const { amount, billing } = req.body || {};
    if (!amount || isNaN(amount)) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const amountCentavos = Math.round(Number(amount) * 100);

    // ✅ Step 1: Create a GCash Source
    const source = await pmPost("https://api.paymongo.com/v1/sources", {
      data: {
        attributes: {
          amount: amountCentavos,
          redirect: {
            success: "https://iskolardev.online/payment-success",
            failed: "https://iskolardev.online/payment-failed",
          },
          type: "gcash",
          currency: "PHP",
          billing: {
            name: billing?.name || "GCash Payer",
            email: billing?.email || "payer@example.com",
            phone: billing?.phone || "09123456789",
          },
        },
      },
    });

    const checkoutUrl = source?.data?.attributes?.redirect?.checkout_url;
    const sourceId = source?.data?.id;

    if (!checkoutUrl) {
      return res
        .status(500)
        .json({ error: "Failed to create GCash checkout URL" });
    }

    // ✅ Save pending payment in Firestore
    await db.collection("payments").doc(sourceId).set({
      amount,
      billing,
      sourceId,
      status: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ checkoutUrl, sourceId });
  } catch (err) {
    console.error("❌ Error in /paymongo/gcash/intent:", err);
    res.status(500).json({ error: err.message || "Server error" });
  }
});

/**
 * Webhook endpoint for PayMongo events
 */
app.post("/paymongo/webhook", express.json({ type: "*/*" }), async (req, res) => {
  try {
    console.log("🔔 Webhook received:", JSON.stringify(req.body, null, 2));

    const event = req.body?.data?.attributes?.type;
    const paymentId = req.body?.data?.id;

    if (!event || !paymentId) {
      console.warn("⚠️ Invalid webhook payload");
      return res.sendStatus(400);
    }

    let update = {};
    if (event === "payment.paid") {
      update = {
        status: "paid",
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
      };
    } else if (event === "payment.failed") {
      update = {
        status: "failed",
        failedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
    }

    if (Object.keys(update).length) {
      await db.collection("payments").doc(paymentId).set(update, { merge: true });
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err);
    res.sendStatus(500);
  }
});

/* ------------------ SERVER ------------------ */
const PORT = process.env.PORT || 8000;
app.listen(PORT, () =>
  console.log(`✅ Server running on http://localhost:${PORT}`)
);
