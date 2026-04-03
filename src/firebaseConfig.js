import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBT24KwgUXj2AJ-Qv2d5_kb-8RRwE3TWtc",
  authDomain: "gibud-f7cc9.firebaseapp.com",
  projectId: "gibud-f7cc9",
  storageBucket: "gibud-f7cc9.appspot.com",
  ...(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID
    ? { messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID }
    : {}),
  ...(import.meta.env.VITE_FIREBASE_APP_ID ? { appId: import.meta.env.VITE_FIREBASE_APP_ID } : {}),
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
