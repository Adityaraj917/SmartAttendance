import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// TODO: REPLACE WITH YOUR FIREBASE CONFIG
// For now, I will add placeholders. You can fill these in, or if you provide them I can add them.
// Ideally, these should be in a .env file.
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDummyKey",
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "smart-attendance.firebaseapp.com",
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "smart-attendance",
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "smart-attendance.appspot.com",
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "123456789",
    appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:123456789:web:abcdef",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// Uncomment if using local emulator during dev
// connectFirestoreEmulator(db, 'localhost', 8080);
