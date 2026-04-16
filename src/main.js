import { createApp } from 'vue'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import Aura from '@primevue/themes/aura'
import ToastService from 'primevue/toastservice'
import Tooltip from 'primevue/tooltip'

import App from './App.vue'
import router from './router'

// ВАЖНО: убедитесь что файл src/firebase.js экспортирует { db, auth }
// Пример минимального firebase.js:
//
//   import { initializeApp } from 'firebase/app'
//   import { getFirestore } from 'firebase/firestore'
//   import { getAuth } from 'firebase/auth'
//   const firebaseApp = initializeApp({ /* ваш конфиг */ })
//   export const db = getFirestore(firebaseApp)
//   export const auth = getAuth(firebaseApp)

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(PrimeVue, {
  theme: { preset: Aura },
  ripple: true
})
app.use(ToastService)
app.directive('tooltip', Tooltip)

app.mount('#app')
