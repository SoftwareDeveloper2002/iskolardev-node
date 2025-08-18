// firebase.js
import admin from "firebase-admin";
import fs from "fs";

// ✅ Load fb.json manually
const serviceAccount = JSON.parse(fs.readFileSync("./fb.json", "utf8"));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

// ✅ Export Firestore and Admin so other files can use them
const db = admin.firestore();

export { admin, db };
