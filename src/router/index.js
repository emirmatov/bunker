import { createRouter, createWebHistory } from 'vue-router'
import { useGameStore } from '../stores/game'
import Home from '../views/Home.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: Home,
      // Главная доступна всем — публичный лендинг
    },
    {
      path: '/rules',
      name: 'rules',
      component: () => import('../views/Rules.vue'),
    },
    {
      path: '/about',
      name: 'about',
      component: () => import('../views/About.vue'),
    },
    {
      path: '/auth',
      name: 'auth',
      component: () => import('../views/Auth.vue'),
      meta: { hideChrome: false },
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('../views/Settings.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/lobby/:id',
      name: 'lobby',
      component: () => import('../views/Lobby.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/game/:id',
      name: 'game',
      component: () => import('../views/Game.vue'),
      meta: { requiresAuth: true, hideChrome: true },
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

router.beforeEach((to) => {
  const store = useGameStore()

  // Уже залогинен — не пускаем на /auth
  if (to.name === 'auth') {
    if (store.currentUser) return { name: 'home' }
    return
  }

  // Защищённый маршрут — нужна авторизация
  if (to.meta.requiresAuth && !store.currentUser) return { name: 'auth' }

  // Никнейм не задан — отправляем в настройки (кроме самой страницы настроек)
  if (to.meta.requiresAuth && to.name !== 'settings' && !store.currentUser?.nickname) {
    return { name: 'settings', query: { setup: '1' } }
  }
})

export default router
