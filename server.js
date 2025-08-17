// server.js
import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import { Buffer } from "buffer";
import 'dotenv/config'; // Loads variables from .env

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

// ✅ Use environment variable for secret key
const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY;

// Helper to encode secret key for Basic Auth
const getAuthHeader = () => {
  if (!PAYMONGO_SECRET_KEY) {
    console.error("⚠️ PAYMONGO_SECRET_KEY not set in .env");
    return "";
  }
  return `Basic ${Buffer.from(PAYMONGO_SECRET_KEY + ":").toString("base64")}`;
};

app.post("/createPaymongoCheckout", async (req, res) => {
  const { amount, customerName, email, description } = req.body;

  if (!amount || !customerName || !email) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    // 1️⃣ Create Payment Intent
    const intentResponse = await fetch("https://api.paymongo.com/v1/payment_intents", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": getAuthHeader(),
      },
      body: JSON.stringify({
        data: {
          attributes: {
            amount: Math.round(amount * 100), // PHP → centavos
            currency: "PHP",
            payment_method_allowed: ["gcash", "grab_pay", "paymaya", "card", "qrph"],
            payment_method_options: { card: { request_three_d_secure: "any" } },
            description: description || "Project Payment",
          },
        },
      }),
    });

    const intentData = await intentResponse.json();
    if (!intentResponse.ok) return res.status(intentResponse.status).json(intentData);

    const paymentIntentId = intentData.data.id;

    // 2️⃣ Create Payment Method (GCash/QR)
    const methodResponse = await fetch("https://api.paymongo.com/v1/payment_methods", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": getAuthHeader(),
      },
      body: JSON.stringify({
        data: {
          attributes: {
            type: "gcash", // Could be "paymaya", "qrph" etc.
            billing: { name: customerName, email: email },
          },
        },
      }),
    });

    const methodData = await methodResponse.json();
    if (!methodResponse.ok) return res.status(methodResponse.status).json(methodData);

    const paymentMethodId = methodData.data.id;

    // 3️⃣ Attach Payment Method to Payment Intent
    const attachResponse = await fetch(
      `https://api.paymongo.com/v1/payment_intents/${paymentIntentId}/attach`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": getAuthHeader(),
        },
        body: JSON.stringify({ data: { attributes: { payment_method: paymentMethodId } } }),
      }
    );

    const attachData = await attachResponse.json();
    if (!attachResponse.ok) return res.status(attachResponse.status).json(attachData);

    // 4️⃣ Return checkout info
    res.json({
      paymentIntent: intentData.data,
      paymentMethod: methodData.data,
      attach: attachData.data,
    });

  } catch (err) {
    console.error("Server Error:", err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
