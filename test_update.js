import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, updateDoc, Timestamp, collection, getDocs, query, where } from "firebase/firestore";
import fs from "fs";

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function run() {
  try {
    const cred = await signInWithEmailAndPassword(auth, "servincg@gmail.com", "teste123123"); 
    console.log("Logged in:", cred.user.uid);
    const q = query(collection(db, "users"), where("role", "==", "admin"));
    const snap = await getDocs(q);
    const adminId = snap.docs[0].id;
    console.log("Updating admin ID:", adminId);
    
    await updateDoc(doc(db, 'users', adminId), {
        subscriptionStatus: 'active',
        subscriptionExpiresAt: Timestamp.fromDate(new Date())
    });
    console.log("Update Success!");
  } catch (e) {
    console.error("Firestore error!", e);
  }
}
run();
