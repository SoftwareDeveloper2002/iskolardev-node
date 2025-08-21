// firebase.js
import fs from "fs";
import path from "path";
import admin from "firebase-admin";

// Make sure the path is correct relative to this file
const serviceAccountPath = path.resolve("./iskolardev-a1383-firebase-adminsdk-fbsvc-65910e56b9.json");

// Read the service account JSON
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Export Firestore and admin for use in other modules
export const db = admin.firestore();
export { admin };
