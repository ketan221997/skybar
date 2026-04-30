import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// ⚠️  PASTE YOUR FIREBASE CONFIG HERE
// Go to Firebase Console → Project Settings → Your Apps → Web App → Config
const firebaseConfig = {
  apiKey: "AIzaSyBKWA0tTH13o8uM9dfssRa2i3hHlQmNRM4",
  authDomain: "sky-high-vk-d5420.firebaseapp.com",
  projectId: "sky-high-vk-d5420",
  storageBucket: "sky-high-vk-d5420.firebasestorage.app",
  messagingSenderId: "726404052914",
  appId: "1:726404052914:web:e4b798f27a7566f57056ab",
  measurementId: "G-XMEFWD3FFB"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
