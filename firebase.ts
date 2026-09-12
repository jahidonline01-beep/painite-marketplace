import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAnR9bzMRnEiFoaQqLHhj7HwB5uwK9ExKM",
  authDomain: "painite-market-8e666.firebaseapp.com",
  projectId: "painite-market-8e666",
  storageBucket: "painite-market-8e666.firebasestorage.app",
  messagingSenderId: "167512629813",
  appId: "1:167512629813:web:9ec283c8dee37b0814c77c",
};

let app: FirebaseApp | null = null;
let db: Firestore | null = null;

export function getFirebaseApp() {
  if (!app) app = getApps()[0] ?? initializeApp(firebaseConfig);
  return app;
}

export function getDb() {
  if (!db) db = getFirestore(getFirebaseApp());
  return db;
}
