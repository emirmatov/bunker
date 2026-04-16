import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { auth } from '../firebase'
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth'

export const useGameStore = defineStore('game', () => {
  // ─── Состояние аутентификации ─────────────────────────────────
  const currentUser = ref(null)
  const isAuthReady = ref(false)

  // Инициализация: слушаем auth и при необходимости входим анонимно
  const initAuth = () =>
    new Promise((resolve) => {
      const unsub = onAuthStateChanged(auth, async (user) => {
        if (user) {
          currentUser.value = { uid: user.uid, isAnonymous: user.isAnonymous }
          isAuthReady.value = true
          unsub()
          resolve(user)
        } else {
          try {
            const cred = await signInAnonymously(auth)
            currentUser.value = { uid: cred.user.uid, isAnonymous: true }
          } catch (e) {
            console.error('[GameStore] Ошибка анонимного входа:', e)
          } finally {
            isAuthReady.value = true
            unsub()
            resolve(null)
          }
        }
      })
    })

  // ─── Состояние текущей комнаты ─────────────────────────────────
  const roomId    = ref(null)
  const roomData  = ref(null)   // данные документа Firestore
  const players   = ref([])     // массив игроков из подколлекции

  const me = computed(() =>
    players.value.find(p => p.uid === currentUser.value?.uid) ?? null
  )

  const alivePlayers = computed(() =>
    players.value.filter(p => p.isAlive !== false)
  )

  const isHost = computed(() => me.value?.isHost === true)

  // Сохранить имя игрока в localStorage между сессиями
  const savedName = ref(localStorage.getItem('bunker_player_name') ?? '')
  const setName = (name) => {
    savedName.value = name
    localStorage.setItem('bunker_player_name', name)
  }

  // Сбросить локальный стейт при выходе из комнаты
  const reset = () => {
    roomId.value   = null
    roomData.value = null
    players.value  = []
  }

  return {
    // auth
    currentUser,
    isAuthReady,
    initAuth,
    // room
    roomId,
    roomData,
    players,
    me,
    alivePlayers,
    isHost,
    // utils
    savedName,
    setName,
    reset
  }
})
