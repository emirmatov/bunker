<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { auth, db, googleProvider } from '../firebase'
import {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
} from 'firebase/auth'
import { doc, setDoc, getDoc } from 'firebase/firestore'
import { useGameStore } from '../stores/game'
import Button    from 'primevue/button'
import InputText from 'primevue/inputtext'
import { useToast } from 'primevue/usetoast'
defineOptions({ name: 'AuthView' })

const router = useRouter()
const toast  = useToast()
const store  = useGameStore()

// mode: 'choose' | 'incognito' | 'login' | 'register'
const mode = ref('choose')

const email           = ref('')
const password        = ref('')
const confirmPassword = ref('')
const nickname        = ref('')
const loading         = ref(false)

const showError = (msg) => toast.add({ severity: 'error', summary: 'Ошибка', detail: msg, life: 4000 })

const afterAuth = async (user) => {
  const snap      = await getDoc(doc(db, 'users', user.uid))
  const savedNick = snap.exists() ? (snap.data().nickname ?? null) : null
  store.currentUser = {
    uid: user.uid, email: user.email, displayName: user.displayName,
    nickname: savedNick, isAnonymous: user.isAnonymous,
  }
  router.push(savedNick ? { name: 'home' } : { name: 'settings', query: { setup: '1' } })
}

const loginWithGoogle = async () => {
  loading.value = true
  try {
    const result = await signInWithPopup(auth, googleProvider)
    await afterAuth(result.user)
  } catch (e) {
    if (e.code !== 'auth/popup-closed-by-user') showError('Ошибка входа через Google')
  } finally {
    loading.value = false
  }
}

const loginAsGuest = async () => {
  const nick = nickname.value.trim()
  if (nick.length < 2)  return showError('Позывной минимум 2 символа')
  if (nick.length > 20) return showError('Позывной максимум 20 символов')

  loading.value = true
  try {
    const result = await signInAnonymously(auth)
    await setDoc(doc(db, 'users', result.user.uid), {
      nickname: nick, isAnonymous: true, createdAt: new Date(),
    })
    store.currentUser = {
      uid: result.user.uid, email: null, displayName: null,
      nickname: nick, isAnonymous: true,
    }
    router.push({ name: 'home' })
  } catch (e) {
    console.error('[anon]', e)
    showError('Не удалось войти инкогнито')
  } finally {
    loading.value = false
  }
}

const loginWithEmail = async () => {
  if (!email.value || !password.value) return showError('Заполните все поля')
  loading.value = true
  try {
    const result = await signInWithEmailAndPassword(auth, email.value, password.value)
    await afterAuth(result.user)
  } catch (e) {
    if (e.code === 'auth/invalid-credential')   showError('Неверный email или пароль')
    else if (e.code === 'auth/too-many-requests') showError('Слишком много попыток. Подождите.')
    else showError('Ошибка входа')
  } finally {
    loading.value = false
  }
}

const registerWithEmail = async () => {
  if (!email.value || !password.value || !nickname.value) return showError('Заполните все поля')
  if (password.value !== confirmPassword.value) return showError('Пароли не совпадают')
  if (password.value.length < 6)               return showError('Пароль минимум 6 символов')
  const nick = nickname.value.trim()
  if (nick.length < 2)                          return showError('Позывной минимум 2 символа')

  loading.value = true
  try {
    const result = await createUserWithEmailAndPassword(auth, email.value, password.value)
    await setDoc(doc(db, 'users', result.user.uid), { nickname: nick, createdAt: new Date() })
    store.currentUser = {
      uid: result.user.uid, email: result.user.email, displayName: null,
      nickname: nick, isAnonymous: false,
    }
    router.push({ name: 'home' })
  } catch (e) {
    if (e.code === 'auth/email-already-in-use') showError('Этот email уже зарегистрирован')
    else if (e.code === 'auth/weak-password')   showError('Пароль слишком слабый')
    else showError('Ошибка регистрации')
  } finally {
    loading.value = false
  }
}

const submit = () => {
  if (mode.value === 'incognito') loginAsGuest()
  else if (mode.value === 'login') loginWithEmail()
  else if (mode.value === 'register') registerWithEmail()
}
</script>

<template>
  <div class="auth-container">
    <div class="hero">
      <div class="hero-icon">☢️</div>
      <h1>БУНКЕР</h1>
      <p class="hero-sub">Выберите способ входа</p>
    </div>

    <div class="form-card">
      <!-- ═══ Выбор способа ═══ -->
      <template v-if="mode === 'choose'">
        <button class="choice-btn choice-incognito" @click="mode = 'incognito'">
          <span class="choice-icon">🕶️</span>
          <div class="choice-text">
            <span class="choice-title">Инкогнито</span>
            <span class="choice-sub">Быстрый вход без регистрации</span>
          </div>
          <span class="choice-arrow">→</span>
        </button>

        <button class="choice-btn choice-login" @click="mode = 'login'">
          <span class="choice-icon">🔑</span>
          <div class="choice-text">
            <span class="choice-title">Войти</span>
            <span class="choice-sub">У меня уже есть аккаунт</span>
          </div>
          <span class="choice-arrow">→</span>
        </button>

        <button class="choice-btn choice-register" @click="mode = 'register'">
          <span class="choice-icon">✨</span>
          <div class="choice-text">
            <span class="choice-title">Регистрация</span>
            <span class="choice-sub">Создать новый аккаунт</span>
          </div>
          <span class="choice-arrow">→</span>
        </button>

        <div class="or-divider"><span>ИЛИ</span></div>

        <button class="google-btn" :disabled="loading" @click="loginWithGoogle">
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/>
            <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z"/>
            <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18l2.67-2.07z"/>
            <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.3z"/>
          </svg>
          Войти через Google
        </button>
      </template>

      <!-- ═══ Инкогнито ═══ -->
      <template v-else-if="mode === 'incognito'">
        <button class="back-btn" @click="mode = 'choose'">← Назад</button>
        <div class="mode-head">
          <h2>🕶️ Инкогнито</h2>
          <p>Только позывной — без email и пароля. Аккаунт удалится после выхода.</p>
        </div>
        <div class="fields">
          <InputText
            v-model="nickname" placeholder="Ваш позывной"
            class="w-full" maxlength="20" :disabled="loading"
            @keyup.enter="submit"
          />
        </div>
        <Button label="Войти анонимно" severity="danger" class="w-full" :loading="loading" @click="submit" />
        <p class="warn-note">⚠️ Если выйти — данные и история игр потеряются. Для сохранения прогресса используйте регистрацию.</p>
      </template>

      <!-- ═══ Вход ═══ -->
      <template v-else-if="mode === 'login'">
        <button class="back-btn" @click="mode = 'choose'">← Назад</button>
        <div class="mode-head">
          <h2>🔑 Вход</h2>
          <p>Введите данные от вашего аккаунта</p>
        </div>
        <div class="fields">
          <InputText v-model="email"    type="email"    placeholder="Email"  class="w-full" :disabled="loading" @keyup.enter="submit" />
          <InputText v-model="password" type="password" placeholder="Пароль" class="w-full" :disabled="loading" @keyup.enter="submit" />
        </div>
        <Button label="Войти" severity="danger" class="w-full" :loading="loading" @click="submit" />
        <button class="text-link" @click="mode = 'register'">Нет аккаунта? Зарегистрироваться →</button>
      </template>

      <!-- ═══ Регистрация ═══ -->
      <template v-else-if="mode === 'register'">
        <button class="back-btn" @click="mode = 'choose'">← Назад</button>
        <div class="mode-head">
          <h2>✨ Регистрация</h2>
          <p>Новый аккаунт с сохранением прогресса</p>
        </div>
        <div class="fields">
          <InputText v-model="email"           type="email"    placeholder="Email"              class="w-full" :disabled="loading" @keyup.enter="submit" />
          <InputText v-model="password"        type="password" placeholder="Пароль (от 6 симв.)" class="w-full" :disabled="loading" @keyup.enter="submit" />
          <InputText v-model="confirmPassword" type="password" placeholder="Подтвердите пароль"  class="w-full" :disabled="loading" @keyup.enter="submit" />
          <InputText v-model="nickname"                        placeholder="Позывной"            class="w-full" maxlength="20" :disabled="loading" @keyup.enter="submit" />
        </div>
        <Button label="Зарегистрироваться" severity="danger" class="w-full" :loading="loading" @click="submit" />
        <button class="text-link" @click="mode = 'login'">Уже есть аккаунт? Войти →</button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.auth-container {
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  min-height: calc(100vh - 60px);
  padding: 1.5rem 1rem;
  background: radial-gradient(ellipse at 50% 0%, rgba(229,62,62,0.08) 0%, transparent 70%);
}

.hero { text-align: center; margin-bottom: 1.75rem; }
.hero-icon {
  font-size: 3.5rem; margin-bottom: 0.4rem;
  filter: drop-shadow(0 0 20px rgba(229,62,62,0.6));
  animation: float 3s ease-in-out infinite;
}
@keyframes float { 0%,100% { transform: translateY(0);} 50% { transform: translateY(-8px);} }
.hero h1  { font-size: clamp(2rem, 8vw, 3.5rem); color: var(--color-accent); text-shadow: 0 0 30px rgba(229,62,62,0.4); margin-bottom: 0.25rem; }
.hero-sub { color: var(--color-muted); font-size: 0.95rem; }

.form-card {
  background: var(--color-surface);
  padding: 1.75rem;
  border-radius: var(--radius-lg);
  width: 100%; max-width: 420px;
  box-shadow: var(--shadow-card), 0 0 0 1px var(--color-border);
  display: flex; flex-direction: column; gap: 0.75rem;
}

/* ─── Карточки выбора ─── */
.choice-btn {
  display: flex; align-items: center; gap: 1rem;
  width: 100%; padding: 1rem 1.25rem;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text); cursor: pointer;
  transition: all 0.2s; text-align: left;
}
.choice-btn:hover {
  border-color: var(--color-accent);
  background: var(--color-surface-2);
  transform: translateY(-1px);
  box-shadow: 0 4px 15px rgba(229,62,62,0.15);
}
.choice-icon { font-size: 1.8rem; flex-shrink: 0; }
.choice-text { display: flex; flex-direction: column; flex: 1; }
.choice-title { font-weight: 700; font-size: 1rem; }
.choice-sub   { color: var(--color-muted); font-size: 0.82rem; margin-top: 2px; }
.choice-arrow {
  color: var(--color-muted); font-size: 1.3rem; flex-shrink: 0;
  transition: transform 0.2s, color 0.2s;
}
.choice-btn:hover .choice-arrow { transform: translateX(3px); color: var(--color-accent); }

.choice-incognito:hover { border-color: #8b5cf6; box-shadow: 0 4px 15px rgba(139,92,246,0.15); }
.choice-incognito:hover .choice-arrow { color: #a78bfa; }

/* ─── Google ─── */
.or-divider {
  display: flex; align-items: center; gap: 0.75rem;
  color: var(--color-muted); font-size: 0.8rem;
  margin: 0.25rem 0;
}
.or-divider::before,
.or-divider::after { content: ''; flex: 1; height: 1px; background: var(--color-border); }

.google-btn {
  display: flex; align-items: center; justify-content: center; gap: 0.75rem;
  width: 100%; padding: 0.7rem 1rem;
  background: #fff; color: #333;
  border: none; border-radius: var(--radius-sm);
  font-size: 0.95rem; font-weight: 600;
  cursor: pointer; transition: background 0.2s;
}
.google-btn:hover    { background: #f0f0f0; }
.google-btn:disabled { opacity: 0.6; cursor: not-allowed; }

/* ─── Формы ─── */
.back-btn {
  align-self: flex-start;
  background: none; border: none;
  color: var(--color-muted); font-size: 0.85rem;
  cursor: pointer; padding: 0.25rem 0;
  margin-bottom: 0.25rem;
}
.back-btn:hover { color: var(--color-text); }

.mode-head h2 { font-size: 1.4rem; color: var(--color-text); margin-bottom: 0.35rem; }
.mode-head p  { color: var(--color-muted); font-size: 0.88rem; line-height: 1.5; }

.fields { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.25rem; }

.warn-note {
  color: var(--color-warn); font-size: 0.78rem;
  line-height: 1.5; text-align: center;
  padding: 0.6rem 0.75rem;
  background: rgba(245,158,11,0.08);
  border: 1px solid rgba(245,158,11,0.25);
  border-radius: var(--radius-sm);
}

.text-link {
  background: none; border: none;
  color: var(--color-muted); font-size: 0.85rem;
  cursor: pointer; padding: 0.35rem; text-align: center;
}
.text-link:hover { color: var(--color-accent); }

/* ─── Мобильная ─── */
@media (max-width: 480px) {
  .form-card   { padding: 1.25rem; border-radius: var(--radius-md); }
  .choice-btn  { padding: 0.85rem 1rem; gap: 0.75rem; }
  .choice-icon { font-size: 1.5rem; }
  .choice-title{ font-size: 0.95rem; }
  .choice-sub  { font-size: 0.78rem; }
}
</style>
