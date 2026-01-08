import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// TODO: Replace with actual keys or use same environment variables process
const firebaseConfig = {
    apiKey: "AIzaSyDummyKey", // Replace with real key if available or prompt user
    authDomain: "smart-attendance.firebaseapp.com",
    projectId: "smart-attendance",
    storageBucket: "smart-attendance.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abcdef",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
