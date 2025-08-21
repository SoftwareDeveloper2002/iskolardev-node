// payment_routes.js
import express from "express";
import fetch from "node-fetch";
import { db, admin } from "./firebase.js"; // Firebase Admin SDK

const router = express.Router();

/* ------------------ PAYMONGO CONFIG ------------------ */
const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY || "sk_test_uYAyatPB8sNrDkLispMVrLh4";

const authHeader = {
  Authorization: "Basic " + Buffer.from(PAYMONGO_SECRET_KEY + ":").toString("base64"),
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
    const msg = data?.errors?.[0]?.detail || JSON.stringify(data);
    throw new Error(`PayMongo error: ${msg}`);
  }

  return data;
}

/* ------------------ ROUTES ------------------ */

/**
 * @route POST /paymongo/:type/intent
 * @desc Create payment intent for GCash or GrabPay
 * @body { amount, billing }
 */
router.post("/:type/intent", async (req, res) => {
  try {
    const paymentType = req.params.type.toLowerCase();
    const { amount, billing } = req.body || {};

    if (!amount || isNaN(amount)) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const amountCentavos = Math.round(Number(amount) * 100);

    // Prepare billing info
    const billingData = {
      name: billing?.name || `${paymentType.toUpperCase()} Payer`,
      email: billing?.email || "payer@example.com",
    };

    // Add phone depending on payment type
    if (paymentType === "gcash") billingData.gcashNumber = billing?.phone || "09123456789";
    if (paymentType === "grab_pay") billingData.phone = billing?.phone || "09123456789";

    const source = await pmPost("https://api.paymongo.com/v1/sources", {
      data: {
        attributes: {
          amount: amountCentavos,
          redirect: {
            success: "https://iskolardev.online/payment-success",
            failed: "https://iskolardev.online/payment-failed",
          },
          type: paymentType, // "gcash" or "grabpay"
          currency: "PHP",
          billing: billingData,
        },
      },
    });

    const checkoutUrl = source?.data?.attributes?.redirect?.checkout_url;
    const sourceId = source?.data?.id;

    if (!checkoutUrl) {
      return res.status(500).json({ error: "Failed to create checkout URL" });
    }

    // Save payment log to Firestore
    await db.collection("payments").doc(sourceId).set({
      amount,
      billing,
      paymentType,
      sourceId,
      status: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ checkoutUrl, sourceId });
  } catch (err) {
    console.error(`❌ Error in /paymongo/${req.params.type}/intent:`, err);
    res.status(500).json({ error: err.message || "Server error" });
  }
});

/**
 * @route POST /paymongo/:type/webhook
 * @desc Webhook handler for payment updates
 */
router.post("/:type/webhook", express.json({ type: "*/*" }), async (req, res) => {
  try {
    const paymentId = req.body?.data?.id;
    const event = req.body?.data?.attributes?.type;

    if (!paymentId || !event) return res.sendStatus(400);

    let update = {};
    if (event === "payment.paid") {
      update = { status: "paid", paidAt: admin.firestore.FieldValue.serverTimestamp() };
    } else if (event === "payment.failed") {
      update = { status: "failed", failedAt: admin.firestore.FieldValue.serverTimestamp() };
    }

    if (Object.keys(update).length) {
      await db.collection("payments").doc(paymentId).set(update, { merge: true });
    }

    res.sendStatus(200);
  } catch (err) {
    console.error(`❌ Webhook error for ${req.params.type}:`, err);
    res.sendStatus(500);
  }
});

export default router;
