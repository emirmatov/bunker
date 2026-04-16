<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { db, auth } from '../firebase'
import { doc, setDoc, getDoc } from 'firebase/firestore'
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth'

import Button    from 'primevue/button'
import InputText from 'primevue/inputtext'
import { useToast } from 'primevue/usetoast'
import { useGameStore } from '../stores/game'
defineOptions({ name: 'HomeView' })
const router  = useRouter()
const toast   = useToast()
const store   = useGameStore()

const playerName = ref(store.savedName)
const joinCode   = ref('')
const loading    = ref(false)

// ─── Утилиты ──────────────────────────────────────────────────────

const generateRoomId = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // убраны I/1/O/0
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

/** Гарантирует анонимного пользователя. Повторно использует существующий, если есть. */
const ensureUser = () =>
  new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      unsub()
      if (user) return resolve(user)
      try {
        const cred = await signInAnonymously(auth)
        resolve(cred.user)
      } catch (e) {
        reject(e)
      }
    })
  })

const showError = (msg) =>
  toast.add({ severity: 'error', summary: 'Ошибка', detail: msg, life: 4000 })

const normCode = () => joinCode.value.replace(/\s/g, '').toUpperCase()

// ─── Создание комнаты ─────────────────────────────────────────────
const createGame = async () => {
  const name = playerName.value.trim()
  if (!name) return showError('Введите ваш позывной')

  loading.value = true
  try {
    const user   = await ensureUser()
    const roomId = generateRoomId()

    await setDoc(doc(db, 'rooms', roomId), {
      status:       'lobby',
      createdAt:    new Date(),
      hostId:       user.uid,
      currentRound: 1,
    })
    await setDoc(doc(db, 'rooms', roomId, 'players', user.uid), {
      name,
      isHost:   true,
      uid:      user.uid,
      joinedAt: new Date(),
    })

    store.setName(name)
    router.push({ name: 'lobby', params: { id: roomId } })
  } catch (e) {
    console.error('Ошибка при создании комнаты:', e)
    showError('Не удалось создать комнату. Проверьте соединение.')
  } finally {
    loading.value = false
  }
}

// ─── Вход в комнату ───────────────────────────────────────────────
const joinGame = async () => {
  const name = playerName.value.trim()
  if (!name) return showError('Введите ваш позывной')

  const code = normCode()
  if (!code)        return showError('Введите код комнаты')
  if (code.length !== 6) return showError('Код должен состоять из 6 символов')

  loading.value = true
  try {
    const user     = await ensureUser()
    const roomRef  = doc(db, 'rooms', code)
    const roomSnap = await getDoc(roomRef)

    if (!roomSnap.exists())
      return showError('Комната с таким кодом не найдена')

    const roomData = roomSnap.data()
    if (roomData.status !== 'lobby')
      return showError('Игра уже началась. Войти нельзя.')

    // Проверяем лимит (не более 12 игроков)
    const { getDocs, collection } = await import('firebase/firestore')
    const snap = await getDocs(collection(db, 'rooms', code, 'players'))
    if (snap.size >= 12)
      return showError('Комната заполнена (максимум 12 игроков)')

    const playerRef  = doc(db, 'rooms', code, 'players', user.uid)
    const playerSnap = await getDoc(playerRef)

    if (!playerSnap.exists()) {
      await setDoc(playerRef, {
        name,
        isHost:   false,
        uid:      user.uid,
        joinedAt: new Date(),
      })
    }

    store.setName(name)
    router.push({ name: 'lobby', params: { id: code } })
  } catch (e) {
    console.error('Ошибка при входе в комнату:', e)
    showError('Не удалось войти в комнату. Проверьте соединение.')
  } finally {
    loading.value = false
  }
}

const onEnter = () => normCode() ? joinGame() : createGame()
</script>

<template>
  <div class="home-container">
    <div class="hero">
      <div class="hero-icon">☢️</div>
      <h1>БУНКЕР</h1>
      <p class="hero-sub">Конец света близок. Спасутся не все.</p>
    </div>

    <div class="form-card">
      <!-- Имя игрока -->
      <div class="input-group">
        <label for="name-input">Ваш позывной</label>
        <InputText
          id="name-input"
          v-model="playerName"
          placeholder="Например: Сталкер"
          class="w-full"
          :disabled="loading"
          maxlength="20"
          @keyup.enter="onEnter"
        />
      </div>

      <!-- Создать -->
      <Button
        label="Создать бункер"
        severity="danger"
        class="w-full"
        :loading="loading"
        icon="pi pi-plus"
        @click="createGame"
      />

      <div class="or-divider"><span>ИЛИ</span></div>

      <!-- Войти -->
      <div class="join-block">
        <InputText
          v-model="joinCode"
          placeholder="Код комнаты (напр. K8X2W3)"
          class="w-full code-input"
          :disabled="loading"
          maxlength="6"
          @keyup.enter="joinGame"
        />
        <Button
          label="Присоединиться"
          severity="secondary"
          class="w-full"
          :loading="loading"
          icon="pi pi-sign-in"
          @click="joinGame"
        />
      </div>
    </div>

    <p class="footer-note">Анонимная игра — никакой регистрации</p>
  </div>
</template>

<style scoped>
.home-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 1.5rem;
  background: radial-gradient(ellipse at 50% 0%, rgba(229,62,62,0.08) 0%, transparent 70%);
}

/* Герой */
.hero { text-align: center; margin-bottom: 2.5rem; }

.hero-icon {
  font-size: 4rem;
  margin-bottom: 0.5rem;
  filter: drop-shadow(0 0 20px rgba(229,62,62,0.6));
  animation: float 3s ease-in-out infinite;
}
@keyframes float {
  0%, 100% { transform: translateY(0); }
  50%       { transform: translateY(-8px); }
}

.hero h1 {
  font-size: clamp(2.5rem, 8vw, 4rem);
  color: var(--color-accent);
  text-shadow: 0 0 30px rgba(229,62,62,0.4);
  margin-bottom: 0.5rem;
}

.hero-sub {
  color: var(--color-muted);
  font-size: 1rem;
}

/* Карточка формы */
.form-card {
  background: var(--color-surface);
  padding: 2rem;
  border-radius: var(--radius-lg);
  width: 100%;
  max-width: 420px;
  box-shadow: var(--shadow-card), 0 0 0 1px var(--color-border);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-bottom: 0.25rem;
}
.input-group label { color: var(--color-muted); font-size: 0.85rem; }

.or-divider {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: var(--color-muted);
  font-size: 0.8rem;
  margin: 0.25rem 0;
}
.or-divider::before,
.or-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--color-border);
}

.join-block { display: flex; flex-direction: column; gap: 0.5rem; }

.code-input :deep(input) {
  text-transform: uppercase;
  letter-spacing: 6px;
  text-align: center;
  font-weight: 700;
  font-size: 1.1rem;
}

.footer-note {
  margin-top: 1.5rem;
  color: #444;
  font-size: 0.75rem;
}
</style>
