import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyBLVdLeyqamJJEaYMTKlzLOOVAE3QhyK3g",
  authDomain: "school-activity-manageme-7c78f.firebaseapp.com",
  projectId: "school-activity-manageme-7c78f",
  storageBucket: "school-activity-manageme-7c78f.firebasestorage.app",
  messagingSenderId: "989397764336",
  appId: "1:989397764336:web:b4565c45e3fbf6e16e1a35",
  measurementId: "G-5QXHD7XDHP"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const analytics = getAnalytics(app);
