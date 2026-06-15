import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCqy-Yp1nm5OYmKo7SzpdRldLPhPhVclNk",
  authDomain: "gen-lang-client-0319331136.firebaseapp.com",
  projectId: "gen-lang-client-0319331136",
  storageBucket: "gen-lang-client-0319331136.firebasestorage.app",
  messagingSenderId: "403842923226",
  appId: "1:403842923226:web:25fa89ecca2d9e52cd03e3",
  measurementId: "G-CLZWHKTLVY"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
