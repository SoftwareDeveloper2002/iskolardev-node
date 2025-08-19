import admin from "firebase-admin";
import fs from "fs";
import path from "path";

let serviceAccount;

try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    // ✅ Use ENV JSON in deployment
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    console.log("📂 Using service account from environment variable");
  } else {
    // ✅ Use local file for development
    const serviceAccountPath = path.resolve(
      process.env.FIREBASE_SERVICE_ACCOUNT || "./iskolardev-a1383-firebase-adminsdk-fbsvc-039d3e71d4.json"
    );
    console.log("📂 Using service account file:", serviceAccountPath);
    serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
  }
} catch (err) {
  console.error("❌ Failed to load service account:", err);
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log("✅ Firebase Admin initialized");
}

const db = admin.firestore();
export { admin, db };
