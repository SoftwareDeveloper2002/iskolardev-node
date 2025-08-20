import admin from "firebase-admin";
import fs from "fs";

// Local file path
const serviceAccount = JSON.parse(
  fs.readFileSync("./iskolardev-a1383-firebase-adminsdk-fbsvc-65910e56b9.json", "utf8")
);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export const db = admin.firestore();

export { admin};
