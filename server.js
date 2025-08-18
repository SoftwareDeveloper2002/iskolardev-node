// server.js
import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import 'dotenv/config';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY;
if (!PAYMONGO_SECRET_KEY) {
  console.error("❌ Missing PAYMONGO_SECRET_KEY in .env");
  process.exit(1);
}

const authHeader = {
  Authorization: "Basic " + Buffer.from(PAYMONGO_SECRET_KEY + ":").toString("base64"),
  "Content-Type": "application/json",
};

// Helper: PayMongo POST
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

/**
 * Create PayMongo GCash Payment Intent and return checkout URL
 * Body:
 * {
 *   "amount": 100.00,           // PHP
 *   "billing": { name, email, phone }  // optional, but recommended
 * }
 */
app.post("/paymongo/gcash/intent", async (req, res) => {
  try {
    const { amount, billing } = req.body || {};
    if (!amount || isNaN(amount)) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const amountCentavos = Math.round(Number(amount) * 100);

    // 1) Create Payment Method (gcash)
    const pm = await pmPost("https://api.paymongo.com/v1/payment_methods", {
      data: {
        attributes: {
          type: "gcash",
          billing: {
            name: billing?.name || "GCash Payer",
            email: billing?.email || "payer@example.com",
            phone: billing?.phone || "09123456789",
          },
        },
      },
    });
    const paymentMethodId = pm?.data?.id;

    // 2) Create Payment Intent
    const pi = await pmPost("https://api.paymongo.com/v1/payment_intents", {
      data: {
        attributes: {
          amount: amountCentavos,
          payment_method_allowed: ["gcash"],
          payment_method_options: { gcash: { version: "v1" } },
          currency: "PHP",
          capture_type: "automatic",
          description: "Downpayment via GCash",
        },
      },
    });
    const intentId = pi?.data?.id;

    // 3) Attach Payment Method to Payment Intent
    const attach = await pmPost(
      `https://api.paymongo.com/v1/payment_intents/${intentId}/attach`,
      {
        data: {
          attributes: {
            payment_method: paymentMethodId,
            // optional: return_url: "https://yourapp.com/return"  // if you want redirect back
          },
        },
      }
    );

    const checkoutUrl = attach?.data?.attributes?.next_action?.redirect?.url;
    if (!checkoutUrl) {
      return res.status(500).json({ error: "Failed to create GCash checkout URL" });
    }

    res.json({ checkoutUrl, intentId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Server error" });
  }
});

// (Optional) Webhook endpoint skeleton
app.post("/paymongo/webhook", express.json({ type: "*/*" }), async (req, res) => {
  // TODO: verify signature (x-paymongo-signature) if you enable webhook signing
  // Handle events like payment.paid, payment.failed, etc.
  console.log("Webhook received:", JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
