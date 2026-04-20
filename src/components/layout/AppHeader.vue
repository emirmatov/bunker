<script setup>
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { signOut } from 'firebase/auth'
import { auth } from '../../firebase'
import { useGameStore } from '../../stores/game'
import Button from 'primevue/button'

const router = useRouter()
const route  = useRoute()
const store  = useGameStore()

const menuOpen = ref(false)
const mobileOpen = ref(false)

const user = computed(() => store.currentUser)
const initial = computed(() =>
  (user.value?.nickname || user.value?.email || '?').charAt(0).toUpperCase()
)

const go = (name) => {
  mobileOpen.value = false
  menuOpen.value = false
  router.push({ name })
}

const logout = async () => {
  menuOpen.value = false
  await signOut(auth)
  router.push({ name: 'home' })
}

const isActive = (name) => route.name === name
</script>

<template>
  <header class="site-header">
    <div class="header-inner">
      <!-- Лого -->
      <router-link :to="{ name: 'home' }" class="brand">
        <span class="brand-icon">☢️</span>
        <span class="brand-name">БУНКЕР</span>
      </router-link>

      <!-- Десктопная навигация -->
      <nav class="nav-desktop">
        <router-link :to="{ name: 'home' }"    class="nav-link" :class="{ active: isActive('home') }">Играть</router-link>
        <router-link v-if="user" :to="{ name: 'lobbies' }" class="nav-link" :class="{ active: isActive('lobbies') }">🌐 Лобби</router-link>
        <router-link :to="{ name: 'rules' }"   class="nav-link" :class="{ active: isActive('rules') }">Правила</router-link>
        <router-link :to="{ name: 'about' }"   class="nav-link" :class="{ active: isActive('about') }">О проекте</router-link>
      </nav>

      <!-- Правая часть: профиль или кнопки входа -->
      <div class="header-right">
        <template v-if="user">
          <button class="profile-btn" @click="menuOpen = !menuOpen">
            <span class="avatar">{{ user.avatar || initial }}</span>
            <span class="profile-name">{{ user.nickname || 'Без позывного' }}</span>
            <span class="chevron" :class="{ open: menuOpen }">▾</span>
          </button>
          <div v-if="menuOpen" class="profile-menu" @click.self="menuOpen = false">
            <div class="menu-box">
              <div class="menu-user">
                <span v-if="user.isAnonymous" class="anon-badge">🕶️ Инкогнито</span>
                <span v-else class="menu-email">{{ user.email || 'Аккаунт' }}</span>
              </div>
              <button v-if="!user.isAnonymous" class="menu-item" @click="go('profile')">👤 Мой профиль</button>
              <button class="menu-item" @click="go('lobbies')">🌐 Публичные лобби</button>
              <button class="menu-item" @click="go('settings')">⚙️ Настройки</button>
              <button class="menu-item danger" @click="logout">🚪 Выйти</button>
            </div>
          </div>
        </template>
        <template v-else>
          <Button label="Войти"        text size="small" @click="go('auth')" />
          <Button label="Регистрация"  severity="danger" size="small" @click="go('auth')" />
        </template>

        <button class="burger" :class="{ open: mobileOpen }" @click="mobileOpen = !mobileOpen" aria-label="Меню">
          <span></span><span></span><span></span>
        </button>
      </div>
    </div>

    <!-- Мобильное меню -->
    <div v-if="mobileOpen" class="nav-mobile">
      <router-link :to="{ name: 'home' }"  class="m-link" @click="mobileOpen = false">Играть</router-link>
      <router-link :to="{ name: 'rules' }" class="m-link" @click="mobileOpen = false">Правила</router-link>
      <router-link :to="{ name: 'about' }" class="m-link" @click="mobileOpen = false">О проекте</router-link>
      <template v-if="user">
        <router-link v-if="!user.isAnonymous" :to="{ name: 'profile' }"  class="m-link" @click="mobileOpen = false">👤 Мой профиль</router-link>
        <router-link :to="{ name: 'lobbies' }"  class="m-link" @click="mobileOpen = false">🌐 Публичные лобби</router-link>
        <router-link :to="{ name: 'settings' }" class="m-link" @click="mobileOpen = false">⚙️ Настройки</router-link>
        <button class="m-link m-danger" @click="logout">🚪 Выйти</button>
      </template>
      <template v-else>
        <router-link :to="{ name: 'auth' }" class="m-link" @click="mobileOpen = false">Войти / Регистрация</router-link>
      </template>
    </div>
  </header>
</template>

<style scoped>
.site-header {
  position: sticky; top: 0; z-index: 100;
  background: rgba(15,15,15,0.85);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--color-border);
}
.header-inner {
  max-width: 1400px; margin: 0 auto;
  padding: 0.75rem 1.5rem;
  display: flex; align-items: center; gap: 2rem;
}

.brand {
  display: flex; align-items: center; gap: 0.5rem;
  text-decoration: none; color: var(--color-text);
  font-family: 'Russo One', sans-serif;
  font-size: 1.25rem; letter-spacing: 2px;
  transition: opacity 0.2s;
}
.brand:hover { opacity: 0.85; }
.brand-icon  { font-size: 1.4rem; filter: drop-shadow(0 0 8px rgba(229,62,62,0.5)); }
.brand-name  { color: var(--color-accent); }

.nav-desktop {
  display: flex; gap: 0.5rem; margin-left: 1rem; flex: 1;
}
.nav-link {
  padding: 0.5rem 0.9rem;
  color: var(--color-muted); text-decoration: none;
  font-weight: 500; font-size: 0.9rem;
  border-radius: var(--radius-sm);
  transition: all 0.2s;
}
.nav-link:hover { color: var(--color-text); background: var(--color-surface); }
.nav-link.active { color: var(--color-accent); }

.header-right {
  margin-left: auto;
  display: flex; align-items: center; gap: 0.5rem;
  position: relative;
}

.profile-btn {
  display: flex; align-items: center; gap: 0.5rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  padding: 0.35rem 0.75rem 0.35rem 0.35rem;
  border-radius: 999px; cursor: pointer;
  color: var(--color-text);
  transition: all 0.2s;
}
.profile-btn:hover { border-color: var(--color-accent); }
.avatar {
  width: 28px; height: 28px; border-radius: 50%;
  background: linear-gradient(135deg, var(--color-accent), #c53030);
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 0.85rem;
}
.profile-name { font-size: 0.88rem; font-weight: 600; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chevron     { font-size: 0.7rem; color: var(--color-muted); transition: transform 0.2s; }
.chevron.open { transform: rotate(180deg); }

.profile-menu {
  position: absolute; top: calc(100% + 0.5rem); right: 0;
  z-index: 200;
}
.menu-box {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  min-width: 220px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.6);
  overflow: hidden;
}
.menu-user    { padding: 0.75rem 1rem; border-bottom: 1px solid var(--color-border); }
.menu-email   { color: var(--color-muted); font-size: 0.8rem; word-break: break-all; }
.anon-badge   {
  display: inline-block; padding: 0.2rem 0.5rem;
  font-size: 0.75rem; font-weight: 600;
  color: #a78bfa; background: rgba(139,92,246,0.12);
  border: 1px solid rgba(139,92,246,0.3); border-radius: 999px;
}
.menu-item {
  display: block; width: 100%; text-align: left;
  padding: 0.7rem 1rem;
  background: none; border: none; cursor: pointer;
  color: var(--color-text); font-size: 0.9rem;
  transition: background 0.15s;
}
.menu-item:hover { background: var(--color-surface-2); }
.menu-item.danger { color: var(--color-accent); border-top: 1px solid var(--color-border); }

/* Бургер (мобильная) */
.burger {
  display: none;
  flex-direction: column; justify-content: center; gap: 4px;
  background: none; border: none; cursor: pointer;
  width: 32px; height: 32px; padding: 0;
}
.burger span {
  width: 22px; height: 2px; background: var(--color-text);
  transition: all 0.25s;
}
.burger.open span:nth-child(1) { transform: translateY(6px) rotate(45deg); }
.burger.open span:nth-child(2) { opacity: 0; }
.burger.open span:nth-child(3) { transform: translateY(-6px) rotate(-45deg); }

.nav-mobile {
  display: none;
  flex-direction: column;
  background: var(--color-surface);
  border-top: 1px solid var(--color-border);
  padding: 0.5rem;
}
.m-link {
  padding: 0.85rem 1rem;
  color: var(--color-text); text-decoration: none;
  background: none; border: none; text-align: left;
  font-size: 0.95rem; cursor: pointer;
  border-radius: var(--radius-sm);
}
.m-link:hover { background: var(--color-surface-2); }
.m-danger     { color: var(--color-accent); }

@media (max-width: 768px) {
  .nav-desktop  { display: none; }
  .profile-name { display: none; }
  .burger       { display: flex; }
  .nav-mobile   { display: flex; }
  .header-inner { gap: 1rem; padding: 0.6rem 1rem; }
}
</style>
