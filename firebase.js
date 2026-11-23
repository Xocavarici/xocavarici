import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDpreHhrcm7ICHeRQd26hjmTYTnlYUid2A",
  authDomain: "xocavar-ici.firebaseapp.com",
  databaseURL: "https://xocavar-ici-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "xocavar-ici",
  storageBucket: "xocavar-ici.firebasestorage.app",
  messagingSenderId: "393113019578",
  appId: "1:393113019578:web:6ff08bdb7b82ecbdb60e83",
  measurementId: "G-MVBZ77LFXF"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
