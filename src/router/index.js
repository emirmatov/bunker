import { createRouter, createWebHistory } from 'vue-router'
import { auth } from '../firebase'
import { onAuthStateChanged } from 'firebase/auth'
import Home from '../views/Home.vue'

/** Ждём первой инициализации Firebase Auth перед навигацией */
const getCurrentUser = () =>
  new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe()
      resolve(user)
    })
  })

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: Home
    },
    {
      path: '/lobby/:id',
      name: 'lobby',
      component: () => import('../views/Lobby.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/game/:id',
      name: 'game',
      component: () => import('../views/Game.vue'),
      meta: { requiresAuth: true }
    },
    // Fallback — перекидываем на главную при неизвестном маршруте
    {
      path: '/:pathMatch(.*)*',
      redirect: '/'
    }
  ]
})

// Гард: защищённые маршруты доступны только авторизованным пользователям
router.beforeEach(async (to) => {
  if (to.meta.requiresAuth) {
    const user = await getCurrentUser()
    if (!user) return { name: 'home' }
  }
})

export default router
