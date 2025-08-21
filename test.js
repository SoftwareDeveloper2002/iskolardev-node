import admin from "firebase-admin";
import fs from "fs";

const serviceAccount = JSON.parse(fs.readFileSync("./iskolardev-a1383-firebase-adminsdk-fbsvc-65910e56b9.json", "utf8"));
serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const db = admin.firestore();

// Just list 1 user to test Admin SDK
admin.auth().listUsers(1)
  .then((res) => console.log("✅ Admin SDK works:", res.users))
  .catch((err) => console.error("❌ Admin SDK failed:", err));
