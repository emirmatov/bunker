import { createApp } from 'vue'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import Aura from '@primevue/themes/aura'
import ToastService from 'primevue/toastservice'
import Tooltip from 'primevue/tooltip'

import App from './App.vue'
import router from './router'
import { useGameStore } from './stores/game'

async function bootstrap() {
  const app   = createApp(App)
  const pinia = createPinia()

  app.use(pinia)

  // Ждём инициализации auth ДО первой навигации роутера,
  // чтобы guard мог проверить store.currentUser синхронно
  const store = useGameStore()
  await store.initAuth()

  app.use(router)
  app.use(PrimeVue, { theme: { preset: Aura }, ripple: true })
  app.use(ToastService)
  app.directive('tooltip', Tooltip)

  app.mount('#app')
}

bootstrap()
