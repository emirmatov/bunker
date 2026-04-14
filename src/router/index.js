import { createRouter, createWebHistory } from 'vue-router'
import Home from '../views/Home.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
routes: [
    { path: '/', name: 'home', component: Home },
    {
      path: '/lobby/:id', // Добавили двоеточие — теперь это динамический параметр
      name: 'lobby',
      component: () => import('../views/Lobby.vue')
    },
    {
      path: '/game/:id', // То же самое для экрана игры
      name: 'game',
      component: () => import('../views/Game.vue')
    }
  ]
})

export default router
