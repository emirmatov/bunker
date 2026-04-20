import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { auth, db } from '../firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'

export const useGameStore = defineStore('game', () => {
  const currentUser = ref(null) // { uid, email, displayName, nickname }
  const isAuthReady = ref(false)

  const initAuth = () =>
    new Promise((resolve) => {
      let resolved = false
      // Листенер остаётся активным до конца жизни приложения —
      // тогда logout/login автоматически отражаются в store
      onAuthStateChanged(auth, async (user) => {
        if (user) {
          const snap = await getDoc(doc(db, 'users', user.uid))
          const nickname = snap.exists() ? (snap.data().nickname ?? null) : null
          currentUser.value = {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            nickname,
            isAnonymous: user.isAnonymous,
          }
        } else {
          currentUser.value = null
        }
        isAuthReady.value = true
        if (!resolved) { resolved = true; resolve(user) }
      })
    })

  const setNickname = (nickname) => {
    if (currentUser.value) currentUser.value = { ...currentUser.value, nickname }
  }

  // ─── Состояние комнаты ────────────────────────────────────────
  const roomId   = ref(null)
  const roomData = ref(null)
  const players  = ref([])

  const me = computed(() =>
    players.value.find(p => p.uid === currentUser.value?.uid) ?? null
  )
  const alivePlayers = computed(() =>
    players.value.filter(p => p.isAlive !== false)
  )
  const isHost = computed(() => me.value?.isHost === true)

  const reset = () => {
    roomId.value   = null
    roomData.value = null
    players.value  = []
  }

  return {
    currentUser,
    isAuthReady,
    initAuth,
    setNickname,
    roomId,
    roomData,
    players,
    me,
    alivePlayers,
    isHost,
    reset,
  }
})
