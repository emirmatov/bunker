<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { db, auth } from '../firebase'
import {
  doc, setDoc, getDoc, getDocs, collection,
  query, where, orderBy, limit, onSnapshot, serverTimestamp,
} from 'firebase/firestore'
import Button    from 'primevue/button'
import InputText from 'primevue/inputtext'
import { useToast } from 'primevue/usetoast'
import { useGameStore } from '../stores/game'
defineOptions({ name: 'HomeView' })

const router = useRouter()
const toast  = useToast()
const store  = useGameStore()

const joinCode = ref('')
const loading  = ref(false)

const isLogged = computed(() => !!store.currentUser)

// ─── Опции создания комнаты ─────────────────────────────────
const newRoomName = ref('')
const newRoomPublic = ref(false)

// ─── Превью публичных лобби ─────────────────────────────────
const publicRooms = ref([])
let unsubPublic = null
onMounted(() => {
  if (!isLogged.value) return
  const q = query(
    collection(db, 'rooms'),
    where('isPublic', '==', true),
    where('status', '==', 'lobby'),
    orderBy('createdAt', 'desc'),
    limit(3),
  )
  unsubPublic = onSnapshot(q, (snap) => {
    publicRooms.value = snap.docs.map(d => ({ id: d.id, ...d.data() }))
  }, () => { /* index may be missing — тихо */ })
})
onUnmounted(() => unsubPublic?.())

const generateRoomId = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const arr   = new Uint32Array(6)
  crypto.getRandomValues(arr)
  return Array.from(arr, (n) => chars[n % chars.length]).join('')
}

const showError = (msg) =>
  toast.add({ severity: 'error', summary: 'Ошибка', detail: msg, life: 4000 })

const normCode = () => joinCode.value.replace(/\s/g, '').toUpperCase()

const ensureNickname = () => {
  if (!isLogged.value) {
    router.push({ name: 'auth' })
    return false
  }
  if (!store.currentUser?.nickname) {
    router.push({ name: 'settings', query: { setup: '1' } })
    return false
  }
  return true
}

const createGame = async () => {
  if (!ensureNickname()) return
  loading.value = true
  try {
    const user   = auth.currentUser
    const name   = store.currentUser.nickname
    const roomId = generateRoomId()
    const roomName = newRoomName.value.trim().slice(0, 40) || `Бункер ${name}`

    await setDoc(doc(db, 'rooms', roomId), {
      status: 'lobby',
      createdAt: serverTimestamp(),
      hostId: user.uid,
      hostName: name,
      hostIsAnonymous: !!user.isAnonymous,
      currentRound: 1,
      isPublic: newRoomPublic.value,
      name: roomName,
      maxPlayers: 12,
      playerCount: 1,
    })
    await setDoc(doc(db, 'rooms', roomId, 'players', user.uid), {
      name, isHost: true, uid: user.uid, joinedAt: new Date(),
      isAnonymous: !!user.isAnonymous,
    })
    router.push({ name: 'lobby', params: { id: roomId } })
  } catch (e) {
    console.error('Ошибка при создании комнаты:', e)
    showError('Не удалось создать комнату. Проверьте соединение.')
  } finally {
    loading.value = false
  }
}

const joinPublicRoom = (roomId) => {
  joinCode.value = roomId
  joinGame()
}

const joinGame = async () => {
  if (!ensureNickname()) return
  const code = normCode()
  if (!code)             return showError('Введите код комнаты')
  if (code.length !== 6) return showError('Код должен состоять из 6 символов')

  loading.value = true
  try {
    const user     = auth.currentUser
    const name     = store.currentUser.nickname
    const roomRef  = doc(db, 'rooms', code)
    const roomSnap = await getDoc(roomRef)

    if (!roomSnap.exists())                return showError('Комната с таким кодом не найдена')
    if (roomSnap.data().status !== 'lobby') return showError('Игра уже началась. Войти нельзя.')

    const snap = await getDocs(collection(db, 'rooms', code, 'players'))
    if (snap.size >= 12) return showError('Комната заполнена (максимум 12 игроков)')

    const playerRef  = doc(db, 'rooms', code, 'players', user.uid)
    const playerSnap = await getDoc(playerRef)
    if (!playerSnap.exists()) {
      await setDoc(playerRef, {
        name, isHost: false, uid: user.uid, joinedAt: new Date(),
        isAnonymous: !!user.isAnonymous,
      })
    }
    router.push({ name: 'lobby', params: { id: code } })
  } catch (e) {
    console.error('Ошибка при входе в комнату:', e)
    showError('Не удалось войти в комнату. Проверьте соединение.')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="home-page">
    <!-- ═══ Герой ═══ -->
    <section class="hero">
      <div class="hero-bg" aria-hidden="true"></div>
      <div class="hero-inner">
        <div class="hero-icon">☢️</div>
        <h1 class="hero-title">БУНКЕР</h1>
        <p class="hero-sub">
          Социальная игра на выживание. Конец света близок — спасутся не все.
          Убеди остальных, что именно ты заслуживаешь места в бункере.
        </p>
        <div class="hero-meta">
          <span class="meta-item">👥 от 4 до 12 игроков</span>
          <span class="meta-dot">•</span>
          <span class="meta-item">⏱ 20–40 минут</span>
          <span class="meta-dot">•</span>
          <span class="meta-item">🎭 16+</span>
        </div>

        <!-- CTA блок -->
        <div class="cta-card">
          <template v-if="isLogged">
            <div class="user-row">
              <button
                class="callsign-btn"
                @click="$router.push({ name: store.currentUser?.isAnonymous ? 'settings' : 'profile' })"
              >
                <span class="user-avatar">{{ store.currentUser?.avatar || '🧍' }}</span>
                <span class="callsign">{{ store.currentUser?.nickname || 'Без позывного' }}</span>
                <span v-if="store.currentUser?.isAnonymous" class="anon-chip">🕶️</span>
              </button>
              <button class="settings-link" @click="$router.push({ name: 'settings' })" title="Настройки">⚙️</button>
            </div>

            <!-- Создание -->
            <div class="create-block">
              <InputText
                v-model="newRoomName" placeholder="Название комнаты (необязательно)"
                maxlength="40" class="w-full" :disabled="loading"
              />
              <label class="public-toggle">
                <input type="checkbox" v-model="newRoomPublic" :disabled="loading" />
                <span>🌐 Публичная — показать в списке лобби</span>
              </label>
              <Button
                label="Создать бункер" severity="danger" class="w-full cta-main"
                :loading="loading" icon="pi pi-plus" size="large"
                @click="createGame"
              />
            </div>

            <div class="or-divider"><span>ИЛИ</span></div>

            <div class="join-block">
              <InputText
                v-model="joinCode" placeholder="Код комнаты"
                class="w-full code-input" :disabled="loading"
                maxlength="6" @keyup.enter="joinGame"
              />
              <Button
                label="Присоединиться по коду" severity="secondary" class="w-full"
                :loading="loading" icon="pi pi-sign-in" @click="joinGame"
              />
            </div>

            <button class="browse-link" @click="$router.push({ name: 'lobbies' })">
              🌐 Смотреть все публичные лобби →
            </button>
          </template>
          <template v-else>
            <p class="cta-hint">Войдите, чтобы создать комнату или присоединиться к друзьям</p>
            <Button
              label="Войти / Регистрация" severity="danger" class="w-full cta-main"
              icon="pi pi-sign-in" size="large"
              @click="$router.push({ name: 'auth' })"
            />
            <button class="guest-link" @click="$router.push({ name: 'rules' })">Сначала почитать правила →</button>
          </template>
        </div>
      </div>
    </section>

    <!-- ═══ Публичные лобби (превью) ═══ -->
    <section v-if="isLogged && publicRooms.length" class="public-preview">
      <div class="pp-head">
        <h2 class="section-title" style="margin:0">🌐 ОТКРЫТЫЕ ЛОББИ</h2>
        <button class="pp-all" @click="$router.push({ name: 'lobbies' })">Все →</button>
      </div>
      <div class="pp-grid">
        <article v-for="r in publicRooms" :key="r.id" class="pp-card" @click="joinPublicRoom(r.id)">
          <div class="pp-name">{{ r.name || 'Без названия' }}</div>
          <div class="pp-meta">
            <span>👥 {{ r.playerCount || 0 }}/{{ r.maxPlayers || 12 }}</span>
            <span class="pp-host">хост: {{ r.hostName || '—' }}</span>
          </div>
          <div class="pp-code">#{{ r.id }}</div>
        </article>
      </div>
    </section>

    <!-- ═══ Фичи ═══ -->
    <section class="features">
      <h2 class="section-title">ЧТО ВНУТРИ</h2>
      <div class="features-grid">
        <div class="feature">
          <div class="feature-icon">🎴</div>
          <h3>Тайные карточки</h3>
          <p>Профессия, здоровье, багаж, фобия — раскрывайте по одной и стройте легенду.</p>
        </div>
        <div class="feature">
          <div class="feature-icon">⚡</div>
          <h3>30+ спецкарт</h3>
          <p>Убийства, лечение, кража голосов, воскрешения — карты меняют ход игры в секунду.</p>
        </div>
        <div class="feature">
          <div class="feature-icon">🗳️</div>
          <h3>Честное голосование</h3>
          <p>После каждого раунда решаете, кого изгнать из бункера. Без админов и споров.</p>
        </div>
        <div class="feature">
          <div class="feature-icon">📦</div>
          <h3>Два пака контента</h3>
          <p>Стандартный пак для компании коллег и 18+ пак — для вечеринки с друзьями.</p>
        </div>
        <div class="feature">
          <div class="feature-icon">⏱</div>
          <h3>Настраиваемый таймер</h3>
          <p>Хост выбирает длительность хода. Можно поставить на паузу, если нужен перерыв.</p>
        </div>
        <div class="feature">
          <div class="feature-icon">👁</div>
          <h3>Режим зрителя</h3>
          <p>Изгнали? Не беда — наблюдайте за продолжением и узнайте секреты соперников.</p>
        </div>
      </div>
    </section>

    <!-- ═══ Как играть ═══ -->
    <section class="how">
      <h2 class="section-title">КАК НАЧАТЬ</h2>
      <ol class="how-steps">
        <li>
          <span class="step-num">1</span>
          <div>
            <h4>Создайте комнату</h4>
            <p>Или введите код от друга. Комната живёт, пока в ней есть игроки.</p>
          </div>
        </li>
        <li>
          <span class="step-num">2</span>
          <div>
            <h4>Позовите друзей</h4>
            <p>Поделитесь 6-значным кодом. От 4 до 12 игроков — оптимально 6–8.</p>
          </div>
        </li>
        <li>
          <span class="step-num">3</span>
          <div>
            <h4>Играйте голосом</h4>
            <p>Созвонитесь в Telegram/Discord. «Бункер» — про обсуждение, а не про клики.</p>
          </div>
        </li>
      </ol>
    </section>

    <!-- ═══ Финальный CTA ═══ -->
    <section class="final-cta">
      <h2>☢️ Готовы узнать, кто спасётся?</h2>
      <Button
        v-if="isLogged"
        label="Создать комнату" severity="danger" icon="pi pi-plus" size="large"
        @click="createGame" :loading="loading"
      />
      <Button
        v-else
        label="Начать играть" severity="danger" icon="pi pi-arrow-right" size="large"
        @click="$router.push({ name: 'auth' })"
      />
    </section>
  </div>
</template>

<style scoped>
.home-page { color: var(--color-text); }

/* ─── Герой ─── */
.hero {
  position: relative; overflow: hidden;
  padding: 3rem 1.5rem 4rem;
  text-align: center;
}
.hero-bg {
  position: absolute; inset: 0;
  background: radial-gradient(ellipse at 50% 0%, rgba(229,62,62,0.12) 0%, transparent 65%);
  pointer-events: none;
}
.hero-inner { position: relative; max-width: 720px; margin: 0 auto; }

.hero-icon {
  font-size: 4rem; margin-bottom: 0.75rem;
  filter: drop-shadow(0 0 25px rgba(229,62,62,0.6));
  animation: float 3s ease-in-out infinite;
}
@keyframes float { 0%,100% { transform: translateY(0);} 50% { transform: translateY(-8px);} }

.hero-title {
  font-size: clamp(2.8rem, 9vw, 5rem);
  color: var(--color-accent);
  text-shadow: 0 0 30px rgba(229,62,62,0.4);
  margin-bottom: 0.5rem; letter-spacing: 4px;
}
.hero-sub {
  color: #ccc; font-size: 1.05rem; line-height: 1.6;
  max-width: 560px; margin: 0 auto 1.25rem;
}
.hero-meta {
  display: flex; justify-content: center; gap: 0.6rem;
  color: var(--color-muted); font-size: 0.88rem;
  margin-bottom: 2rem; flex-wrap: wrap;
}
.meta-dot { color: #333; }

/* ─── CTA ─── */
.cta-card {
  background: var(--color-surface);
  padding: 1.75rem;
  border-radius: var(--radius-lg);
  max-width: 420px; margin: 0 auto;
  box-shadow: var(--shadow-card), 0 0 0 1px var(--color-border);
  display: flex; flex-direction: column; gap: 0.75rem;
  text-align: left;
}
.cta-hint { color: var(--color-muted); text-align: center; font-size: 0.9rem; }
.cta-main { font-family: 'Russo One', sans-serif; letter-spacing: 2px; }

.user-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.45rem 0.6rem; background: var(--color-bg);
  border-radius: var(--radius-sm); margin-bottom: 0.25rem;
}
.callsign-btn {
  display: flex; align-items: center; gap: 0.5rem;
  background: none; border: none; padding: 0.25rem 0.35rem;
  color: var(--color-text); cursor: pointer;
  border-radius: var(--radius-sm); transition: background 0.15s;
  min-width: 0; flex: 1;
}
.callsign-btn:hover { background: var(--color-surface-2); }
.user-avatar {
  width: 28px; height: 28px; border-radius: 50%;
  background: var(--color-accent-dim); border: 1px solid var(--color-accent);
  display: flex; align-items: center; justify-content: center;
  font-size: 0.95rem; flex-shrink: 0;
}
.callsign      { font-weight: 600; font-size: 0.95rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.settings-link { background: none; border: none; color: var(--color-muted); font-size: 1.1rem; cursor: pointer; padding: 0.25rem 0.5rem; }
.settings-link:hover { color: var(--color-text); }

.create-block { display: flex; flex-direction: column; gap: 0.5rem; }
.public-toggle {
  display: flex; align-items: center; gap: 0.5rem;
  color: var(--color-muted); font-size: 0.85rem; cursor: pointer;
  user-select: none; padding: 0.15rem 0;
}
.public-toggle input { accent-color: var(--color-accent); cursor: pointer; }

.browse-link {
  background: none; border: 1px dashed var(--color-border);
  color: var(--color-muted); font-size: 0.85rem;
  padding: 0.55rem; border-radius: var(--radius-sm);
  cursor: pointer; transition: all 0.2s; margin-top: 0.25rem;
}
.browse-link:hover { color: var(--color-accent); border-color: var(--color-accent); }

/* ─── Превью публичных лобби ─── */
.public-preview { max-width: 1100px; margin: 0 auto; padding: 2rem 1.5rem 1rem; }
.pp-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
.pp-all {
  background: none; border: none; color: var(--color-muted);
  font-size: 0.85rem; cursor: pointer; font-weight: 600;
}
.pp-all:hover { color: var(--color-accent); }
.pp-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 0.75rem;
}
.pp-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 0.85rem 1rem; cursor: pointer;
  transition: all 0.2s;
  display: flex; flex-direction: column; gap: 0.4rem;
}
.pp-card:hover {
  border-color: var(--color-accent); transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(229,62,62,0.1);
}
.pp-name { font-weight: 600; color: var(--color-text); }
.pp-meta { display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--color-muted); }
.pp-host { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 50%; }
.pp-code {
  font-family: 'Russo One', monospace; font-size: 0.8rem;
  color: var(--color-warn); letter-spacing: 2px; margin-top: 0.2rem;
}

.or-divider {
  display: flex; align-items: center; gap: 0.75rem;
  color: var(--color-muted); font-size: 0.8rem; margin: 0.25rem 0;
}
.or-divider::before,
.or-divider::after { content: ''; flex: 1; height: 1px; background: var(--color-border); }

.join-block { display: flex; flex-direction: column; gap: 0.5rem; }
.code-input :deep(input) {
  text-transform: uppercase; letter-spacing: 6px; text-align: center;
  font-weight: 700; font-size: 1.1rem;
}
.guest-link {
  background: none; border: none;
  color: var(--color-muted); font-size: 0.85rem;
  cursor: pointer; padding: 0.5rem;
  text-align: center;
}
.guest-link:hover { color: var(--color-accent); }

/* ─── Секции ─── */
.section-title {
  font-size: 1.3rem; letter-spacing: 3px;
  text-align: center; color: var(--color-accent);
  margin-bottom: 2rem;
}

.features { max-width: 1100px; margin: 0 auto; padding: 3rem 1.5rem; }
.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 1rem;
}
.feature {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 1.5rem;
  transition: all 0.25s;
}
.feature:hover {
  transform: translateY(-3px);
  border-color: var(--color-accent);
  box-shadow: 0 10px 25px rgba(229,62,62,0.1);
}
.feature-icon { font-size: 2rem; margin-bottom: 0.75rem; }
.feature h3   { font-size: 1rem; margin-bottom: 0.5rem; letter-spacing: 1px; }
.feature p    { color: var(--color-muted); font-size: 0.88rem; line-height: 1.55; }

.how { max-width: 760px; margin: 0 auto; padding: 3rem 1.5rem; }
.how-steps { list-style: none; display: flex; flex-direction: column; gap: 1rem; }
.how-steps li {
  display: flex; gap: 1.25rem; align-items: flex-start;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 1.25rem 1.5rem;
}
.step-num {
  flex-shrink: 0; width: 36px; height: 36px;
  border-radius: 50%;
  background: var(--color-accent); color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-family: 'Russo One', sans-serif; font-size: 1.1rem;
  box-shadow: 0 0 20px rgba(229,62,62,0.4);
}
.how-steps h4 { font-size: 1.05rem; margin-bottom: 0.25rem; }
.how-steps p  { color: var(--color-muted); font-size: 0.9rem; line-height: 1.5; }

.final-cta {
  text-align: center;
  padding: 4rem 1.5rem;
  border-top: 1px solid var(--color-border);
  background: radial-gradient(ellipse at 50% 100%, rgba(229,62,62,0.08), transparent 60%);
}
.final-cta h2 {
  font-size: clamp(1.4rem, 4vw, 2rem);
  color: var(--color-text);
  margin-bottom: 1.5rem;
}

/* ─── Мобильная ─── */
@media (max-width: 768px) {
  .hero            { padding: 2rem 1rem 3rem; }
  .hero-icon       { font-size: 3rem; }
  .hero-title      { letter-spacing: 3px; }
  .hero-sub        { font-size: 0.95rem; }
  .hero-meta       { font-size: 0.8rem; gap: 0.4rem; }
  .cta-card        { padding: 1.25rem; }
  .features        { padding: 2rem 1rem; }
  .how             { padding: 2rem 1rem; }
  .how-steps li    { padding: 1rem 1.1rem; gap: 1rem; }
  .step-num        { width: 32px; height: 32px; font-size: 1rem; }
  .final-cta       { padding: 2.5rem 1rem; }
}
@media (max-width: 480px) {
  .hero-meta       { flex-direction: column; gap: 0.25rem; }
  .meta-dot        { display: none; }
  .feature         { padding: 1.25rem; }
  .feature-icon    { font-size: 1.75rem; }
  .section-title   { font-size: 1.1rem; letter-spacing: 2px; margin-bottom: 1.5rem; }
}
</style>
