import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDK-PEeSA28SYKvUs3xVh06sTPKohvL674",
  authDomain: "bunker-game-58b60.firebaseapp.com",
  projectId: "bunker-game-58b60",
  storageBucket: "bunker-game-58b60.firebasestorage.app",
  messagingSenderId: "818991873735",
  appId: "1:818991873735:web:b10efb4b6f29246409c8e2"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);

signInAnonymously(auth)
  .then(() => {
    console.log("Успешная анонимная авторизация");
  })
  .catch((error) => {
    console.error("Ошибка авторизации:", error);
  });
