// server.js
import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import { Buffer } from "buffer";
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

const PAYMONGO_SECRET_KEY = 'sk_test_4D5ef3VqrdryX5hbSCJUYG3K';

const getAuthHeader = () => {
  if (!PAYMONGO_SECRET_KEY) {
    console.error("⚠️ PAYMONGO_SECRET_KEY not set in .env");
    return "";
  }
  return `Basic ${Buffer.from(PAYMONGO_SECRET_KEY + ":").toString("base64")}`;
};

app.post("/createPaymongoCheckout", async (req, res) => {
  console.log("Received request body:", req.body);

  const { amount, customerName, email, description, paymentType } = req.body;

  // Validate fields
  if (typeof amount !== "number" || !customerName || !email || !paymentType) {
    return res.status(400).json({ error: "Missing or invalid required fields" });
  }

  try {
    const amountInCentavos = Math.round(amount * 100);

    // 1️⃣ Create Payment Intent (nested format for PayMongo)
    const intentBody = {
      data: {
        attributes: {
          amount: amountInCentavos,
          currency: "PHP",
          payment_method_allowed: [paymentType],
          capture_type: "automatic",
          description: description || "Project Payment",
          statement_descriptor: "ISKOLARDEV",
          ...(paymentType === "card" && {
            payment_method_options: { card: { request_three_d_secure: "any" } }
          }),
        },
      },
    };

    const intentResponse = await fetch("https://api.paymongo.com/v1/payment_intents", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": getAuthHeader(),
      },
      body: JSON.stringify(intentBody),
    });

    const intentData = await intentResponse.json();
    console.log("Payment Intent Response:", intentData);
    if (!intentResponse.ok) return res.status(intentResponse.status).json(intentData);

    const paymentIntentId = intentData.data.id;

    // 2️⃣ Create Payment Method
    const methodBody = {
      data: {
        attributes: {
          type: paymentType,
          billing: { name: customerName, email: email },
        },
      },
    };

    const methodResponse = await fetch("https://api.paymongo.com/v1/payment_methods", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": getAuthHeader(),
      },
      body: JSON.stringify(methodBody),
    });

    const methodData = await methodResponse.json();
    console.log("Payment Method Response:", methodData);
    if (!methodResponse.ok) return res.status(methodResponse.status).json(methodData);

    const paymentMethodId = methodData.data.id;

    // 3️⃣ Attach Payment Method to Payment Intent
    const attachBody = {
      data: {
        attributes: { payment_method: paymentMethodId }
      }
    };

    const attachResponse = await fetch(
      `https://api.paymongo.com/v1/payment_intents/${paymentIntentId}/attach`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": getAuthHeader(),
        },
        body: JSON.stringify(attachBody),
      }
    );

    const attachData = await attachResponse.json();
    console.log("Attach Response:", attachData);
    if (!attachResponse.ok) return res.status(attachResponse.status).json(attachData);

    // 4️⃣ Return checkout info
    res.json({
      paymentIntent: intentData.data,
      paymentMethod: methodData.data,
      attach: attachData.data,
    });

  } catch (err) {
    console.error("Server Error:", err);
    res.status(500).json({ error: "Something went wrong", details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
