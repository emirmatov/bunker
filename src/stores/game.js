import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useGameStore = defineStore('game', () => {
  // Фейковые данные для теста верстки
  const roomId = ref('BUNKER-777')
  const currentUser = ref({ id: 'u1', name: 'Игрок 1', isHost: true })

  const players = ref([
    { id: 'u1', name: 'Игрок 1', isHost: true },
    { id: 'u2', name: 'Игрок 2', isHost: false },
    { id: 'u3', name: 'Игрок 3', isHost: false },
  ])

  return { roomId, currentUser, players }
})
