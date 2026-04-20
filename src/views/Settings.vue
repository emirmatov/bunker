<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { auth, db } from '../firebase'
import { signOut } from 'firebase/auth'
import { doc, setDoc } from 'firebase/firestore'
import { useGameStore } from '../stores/game'
import Button    from 'primevue/button'
import InputText from 'primevue/inputtext'
import { useToast } from 'primevue/usetoast'
defineOptions({ name: 'SettingsView' })

const router  = useRouter()
const route   = useRoute()
const toast   = useToast()
const store   = useGameStore()

const isSetup  = route.query.setup === '1'
const nickname = ref(store.currentUser?.nickname ?? '')
const loading  = ref(false)

const showSuccess = (msg) => toast.add({ severity: 'success', summary: 'Готово',  detail: msg, life: 3000 })
const showError   = (msg) => toast.add({ severity: 'error',   summary: 'Ошибка', detail: msg, life: 4000 })

const saveNickname = async () => {
  const nick = nickname.value.trim()
  if (!nick || nick.length < 2)  return showError('Никнейм минимум 2 символа')
  if (nick.length > 20)          return showError('Никнейм максимум 20 символов')

  loading.value = true
  try {
    await setDoc(doc(db, 'users', auth.currentUser.uid), { nickname: nick, updatedAt: new Date() }, { merge: true })
    store.setNickname(nick)
    showSuccess('Никнейм сохранён!')
    if (isSetup) router.push({ name: 'home' })
  } catch {
    showError('Не удалось сохранить. Проверьте соединение.')
  } finally {
    loading.value = false
  }
}

const logout = async () => {
  await signOut(auth)
  store.currentUser = null
  router.push({ name: 'auth' })
}
</script>

<template>
  <div class="settings-container">
    <div class="settings-card">
      <h1>{{ isSetup ? '👤 Придумайте позывной' : '⚙️ Настройки' }}</h1>
      <p v-if="isSetup" class="hint">Это ваш никнейм в игре. Можно изменить позже в настройках.</p>

      <div class="field">
        <label>Позывной (никнейм)</label>
        <InputText
          v-model="nickname"
          placeholder="Например: Сталкер"
          class="w-full"
          maxlength="20"
          :disabled="loading"
          @keyup.enter="saveNickname"
        />
      </div>

      <Button label="Сохранить" severity="danger" class="w-full" :loading="loading" @click="saveNickname" />

      <template v-if="!isSetup">
        <div class="divider" />
        <p v-if="store.currentUser?.isAnonymous" class="account-info anon">
          🕶️ Анонимный аккаунт — данные будут утеряны при выходе
        </p>
        <p v-else class="account-info">{{ store.currentUser?.email }}</p>
        <Button label="Выйти из аккаунта" severity="secondary" outlined class="w-full" icon="pi pi-sign-out" @click="logout" />
        <Button label="← На главную" severity="secondary" text class="w-full" @click="router.push({ name: 'home' })" />
      </template>
    </div>
  </div>
</template>

<style scoped>
.settings-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - 60px);
  padding: 1.5rem 1rem;
  background: radial-gradient(ellipse at 50% 0%, rgba(229,62,62,0.08) 0%, transparent 70%);
}

.settings-card {
  background: var(--color-surface);
  padding: 2rem;
  border-radius: var(--radius-lg);
  width: 100%;
  max-width: 400px;
  box-shadow: var(--shadow-card), 0 0 0 1px var(--color-border);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.settings-card h1 { color: var(--color-accent); font-size: 1.5rem; }
.hint             { color: var(--color-muted); font-size: 0.9rem; margin-top: -0.5rem; }
.field            { display: flex; flex-direction: column; gap: 0.4rem; }
.field label      { color: var(--color-muted); font-size: 0.85rem; }
.divider          { height: 1px; background: var(--color-border); margin: 0.25rem 0; }
.account-info     { color: var(--color-muted); font-size: 0.85rem; text-align: center; word-break: break-all; }
.account-info.anon{
  color: var(--color-warn);
  background: rgba(245,158,11,0.08);
  border: 1px solid rgba(245,158,11,0.25);
  border-radius: var(--radius-sm);
  padding: 0.6rem; font-size: 0.8rem;
}

@media (max-width: 480px) {
  .settings-card   { padding: 1.5rem 1.25rem; border-radius: var(--radius-md); }
  .settings-card h1{ font-size: 1.25rem; }
}
</style>
