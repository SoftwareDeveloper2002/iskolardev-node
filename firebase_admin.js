import admin from "firebase-admin";
import fs from "fs";
import path from "path";

// Load service account JSON
let serviceAccount;

try {
  // If environment variable exists, treat it as a file path
  const serviceAccountPath = path.resolve(
    process.env.FIREBASE_SERVICE_ACCOUNT || "./iskolardev-a1383-firebase-adminsdk-fbsvc-65910e56b9.json"
  );

  console.log("📂 Using service account file:", serviceAccountPath);

  serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
} catch (err) {
  console.error("❌ Failed to load Firebase service account:", err);
  process.exit(1);
}

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log("✅ Firebase Admin initialized");
}

// Export Firestore instance
const db = admin.firestore();
export { admin, db };
