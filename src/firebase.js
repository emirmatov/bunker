import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'

// Конфиг берётся из .env (переменные VITE_FIREBASE_*)
// Для Vite переменные доступны через import.meta.env — они встраиваются в бандл на build
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
}

// Проверка на этапе старта приложения — лучше упасть сразу, чем ловить странные ошибки auth
const missing = Object.entries(firebaseConfig).filter(([, v]) => !v).map(([k]) => k)
if (missing.length) {
  throw new Error(
    `[firebase] Не заданы переменные окружения: ${missing.join(', ')}. ` +
    `Скопируйте .env.example в .env и заполните.`
  )
}

const app = initializeApp(firebaseConfig)

export const db             = getFirestore(app)
export const auth           = getAuth(app)
export const googleProvider = new GoogleAuthProvider()
