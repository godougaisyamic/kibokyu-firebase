import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAyWAFKbUp4Brm6eUvh6Xbpnovi6uLzzlw",
  authDomain: "kiboukyu-4c522.firebaseapp.com",
  projectId: "kiboukyu-4c522",
  storageBucket: "kiboukyu-4c522.firebasestorage.app",
  messagingSenderId: "902425016895",
  appId: "1:902425016895:web:64bd8e241d46445588d68a",
  measurementId: "G-N1RT1Z7ZJY",
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
