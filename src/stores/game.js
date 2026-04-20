import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { auth, db } from '../firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'

/**
 * Начальный shape профиля — всё, что в users/{uid}.
 * Stats инкрементятся при завершении игры (см. Game.vue).
 */
const DEFAULT_PROFILE = {
  nickname: null,
  avatar: '🧍',
  bio: '',
  stats: {
    gamesPlayed: 0,
    wins: 0,
    survived: 0,
    votedOut: 0,
    killed: 0,
  },
}

/**
 * Гарантирует, что у юзера есть document в users/{uid}.
 * Если нет — создаёт со стартовыми значениями.
 * Возвращает актуальные данные профиля.
 */
export const ensureUserDoc = async (user, { nickname } = {}) => {
  if (!user) return null
  const ref = doc(db, 'users', user.uid)
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    const payload = {
      ...DEFAULT_PROFILE,
      nickname: nickname ?? null,
      isAnonymous: !!user.isAnonymous,
      createdAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
    }
    await setDoc(ref, payload)
    return payload
  }
  // Есть — обновим lastSeenAt и заполним недостающие stats-поля (миграция на лету)
  const data = snap.data()
  const needsMigration = !data.stats || !data.avatar
  const patch = { lastSeenAt: serverTimestamp() }
  if (needsMigration) {
    patch.avatar = data.avatar ?? DEFAULT_PROFILE.avatar
    patch.bio    = data.bio    ?? DEFAULT_PROFILE.bio
    patch.stats  = { ...DEFAULT_PROFILE.stats, ...(data.stats ?? {}) }
  }
  await setDoc(ref, patch, { merge: true })
  return { ...DEFAULT_PROFILE, ...data, ...patch }
}

export const useGameStore = defineStore('game', () => {
  const currentUser = ref(null) // { uid, email, displayName, nickname, avatar, bio, stats, isAnonymous }
  const isAuthReady = ref(false)

  const initAuth = () =>
    new Promise((resolve) => {
      let resolved = false
      onAuthStateChanged(auth, async (user) => {
        if (user) {
          const profile = await ensureUserDoc(user)
          currentUser.value = {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            nickname: profile?.nickname ?? null,
            avatar:   profile?.avatar   ?? DEFAULT_PROFILE.avatar,
            bio:      profile?.bio      ?? '',
            stats:    profile?.stats    ?? { ...DEFAULT_PROFILE.stats },
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

  const patchProfile = (patch) => {
    if (currentUser.value) currentUser.value = { ...currentUser.value, ...patch }
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
    patchProfile,
    roomId,
    roomData,
    players,
    me,
    alivePlayers,
    isHost,
    reset,
  }
})
