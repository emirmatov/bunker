<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { db, auth } from '../firebase'
import { doc, setDoc, getDoc } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'

// PrimeVue компоненты
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'

const router = useRouter()
const toast = useToast()

const playerName = ref('')
const joinCode = ref('')
const loading = ref(false)
const errorMsg = ref('')

// ─────────────────────────────────────────────────────────
// Утилиты
// ─────────────────────────────────────────────────────────

// Генерация кода: всегда ровно 6 символов, только A-Z0-9
const generateRoomId = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // без похожих I/1/O/0
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

// Ожидаем инициализацию Firebase Auth перед любым запросом
const waitForAuth = () =>
  new Promise((resolve, reject) =>
    onAuthStateChanged(auth, user => (user ? resolve(user) : reject(new Error('Не авторизован'))), reject)
  )

const showError = (msg) => {
  errorMsg.value = msg
  toast.add({ severity: 'error', summary: 'Ошибка', detail: msg, life: 4000 })
}

// ─────────────────────────────────────────────────────────
// Создание комнаты (Хост)
// ─────────────────────────────────────────────────────────
const createGame = async () => {
  if (!playerName.value.trim()) return showError('Введите ваш позывной')

  loading.value = true
  errorMsg.value = ''

  try {
    const user = await waitForAuth()
    const roomId = generateRoomId()

    // Создаём документ комнаты
    await setDoc(doc(db, 'rooms', roomId), {
      status: 'lobby',
      createdAt: new Date(),
      hostId: user.uid,
      currentRound: 1,
    })

    // Добавляем хоста как первого игрока
    await setDoc(doc(db, 'rooms', roomId, 'players', user.uid), {
      name: playerName.value.trim(),
      isHost: true,
      uid: user.uid,
      joinedAt: new Date(),
    })

    router.push(`/lobby/${roomId}`)
  } catch (e) {
    console.error('Ошибка при создании комнаты:', e)
    showError('Не удалось создать комнату. Проверьте соединение.')
  } finally {
    loading.value = false
  }
}

// ─────────────────────────────────────────────────────────
// Вход в комнату (Гость)
// ─────────────────────────────────────────────────────────
const joinGame = async () => {
  if (!playerName.value.trim()) return showError('Введите ваш позывной')

  const code = joinCode.value.replace(/\s/g, '').toUpperCase()
  if (!code) return showError('Введите код комнаты')
  if (code.length !== 6) return showError('Код должен состоять из 6 символов')

  loading.value = true
  errorMsg.value = ''

  try {
    const user = await waitForAuth()

    // 1. Проверяем существование комнаты
    const roomRef = doc(db, 'rooms', code)
    const roomSnap = await getDoc(roomRef)

    if (!roomSnap.exists()) {
      return showError('Комната с таким кодом не найдена')
    }

    // 2. Проверяем статус — нельзя входить в уже начатую игру
    const roomData = roomSnap.data()
    if (roomData.status !== 'lobby') {
      return showError('Игра уже началась. Войти нельзя.')
    }

    // 3. Проверяем, не в комнате ли игрок уже
    const playerRef = doc(db, 'rooms', code, 'players', user.uid)
    const playerSnap = await getDoc(playerRef)

    if (playerSnap.exists()) {
      // Игрок уже в комнате — просто перенаправляем
      return router.push(`/lobby/${code}`)
    }

    // 4. Добавляем нового игрока
    await setDoc(playerRef, {
      name: playerName.value.trim(),
      isHost: false,
      uid: user.uid,
      joinedAt: new Date(),
    })

    router.push(`/lobby/${code}`)
  } catch (e) {
    console.error('Ошибка при входе в комнату:', e)
    showError('Не удалось войти в комнату. Проверьте соединение.')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="home-container">
    <!-- PrimeVue Toast для ошибок -->
    <Toast position="top-center" />

    <div class="hero">
      <h1>☢️ БУНКЕР</h1>
      <p>Конец света близок. Спасутся не все.</p>
    </div>

    <div class="form-card">
      <!-- Имя игрока -->
      <div class="input-group">
        <label for="name-input">Ваш позывной (Имя)</label>
        <InputText
          id="name-input"
          v-model="playerName"
          placeholder="Например: Сталкер"
          class="w-full"
          :disabled="loading"
          maxlength="20"
          @keyup.enter="joinCode ? joinGame() : createGame()"
        />
      </div>

      <!-- Создать -->
      <div class="action-block">
        <Button
          label="Создать бункер"
          severity="danger"
          class="w-full"
          :loading="loading"
          @click="createGame"
        />
      </div>

      <div class="or-divider">ИЛИ</div>

      <!-- Войти -->
      <div class="action-block join-block">
        <InputText
          v-model="joinCode"
          placeholder="Код комнаты (напр. K8X2W3)"
          class="w-full text-center"
          :disabled="loading"
          maxlength="6"
          style="text-transform:uppercase; letter-spacing:4px"
          @keyup.enter="joinGame"
        />
        <Button
          label="Присоединиться"
          severity="secondary"
          class="w-full"
          :loading="loading"
          @click="joinGame"
        />
      </div>

      <!-- Инлайн-ошибка (дублирует Toast) -->
      <p v-if="errorMsg" class="error-msg">⚠ {{ errorMsg }}</p>
    </div>
  </div>
</template>

<style scoped>
.home-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 1rem;
}

.hero {
  text-align: center;
  margin-bottom: 3rem;
}

.hero h1 {
  font-size: 3rem;
  margin-bottom: 0.5rem;
  color: #ff5252;
}

.form-card {
  background: #2a2a2a;
  padding: 2rem;
  border-radius: 12px;
  width: 100%;
  max-width: 400px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
}

.input-group label {
  color: #aaa;
  font-size: 0.9rem;
}

.w-full { width: 100%; }
.text-center { text-align: center; }

.action-block {
  margin-bottom: 0.5rem;
}

.join-block {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.or-divider {
  text-align: center;
  color: #666;
  font-size: 0.9rem;
  margin: 1.25rem 0;
}

.error-msg {
  margin-top: 1rem;
  color: #ff5252;
  font-size: 0.85rem;
  text-align: center;
}
</style>
