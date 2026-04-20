<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { db, auth } from '../firebase'
import {
  collection, query, where, onSnapshot, orderBy, limit,
  doc, setDoc, getDoc, getDocs,
} from 'firebase/firestore'
import Button    from 'primevue/button'
import InputText from 'primevue/inputtext'
import Tag       from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import { useGameStore } from '../stores/game'

defineOptions({ name: 'LobbiesView' })

const router = useRouter()
const toast  = useToast()
const store  = useGameStore()

const rooms       = ref([])
const loading     = ref(true)
const searchTerm  = ref('')
const packFilter  = ref('all')  // 'all' | 'standard' | 'adult'
const joining     = ref(null)   // roomId, пока входим

let unsubscribe = null

onMounted(() => {
  // Запрос: публичные комнаты в статусе lobby, свежие сверху
  const q = query(
    collection(db, 'rooms'),
    where('isPublic', '==', true),
    where('status',   '==', 'lobby'),
    orderBy('createdAt', 'desc'),
    limit(30),
  )
  unsubscribe = onSnapshot(q, (snap) => {
    rooms.value = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    loading.value = false
  }, (err) => {
    console.error('[lobbies] snapshot error:', err)
    loading.value = false
    // Может быть ошибка из-за отсутствия индекса — покажем подсказку
    toast.add({
      severity: 'error',
      summary: 'Ошибка',
      detail: 'Не удалось загрузить список. Возможно, нужен индекс Firestore.',
      life: 5000,
    })
  })
})
onUnmounted(() => unsubscribe?.())

// ─── Фильтрация ─────────────────────────────────────────────
const filtered = computed(() => {
  let list = rooms.value
  if (packFilter.value !== 'all') {
    list = list.filter(r => (r.pack || r.packId || 'standard') === packFilter.value)
  }
  const term = searchTerm.value.trim().toLowerCase()
  if (term) {
    list = list.filter(r =>
      (r.name || '').toLowerCase().includes(term) ||
      (r.hostName || '').toLowerCase().includes(term) ||
      r.id.toLowerCase().includes(term)
    )
  }
  return list
})

// ─── Вход в комнату ─────────────────────────────────────────
const joinRoom = async (room) => {
  if (!store.currentUser) {
    router.push({ name: 'auth' })
    return
  }
  if (!store.currentUser.nickname) {
    router.push({ name: 'settings', query: { setup: '1' } })
    return
  }

  joining.value = room.id
  try {
    const roomRef  = doc(db, 'rooms', room.id)
    const roomSnap = await getDoc(roomRef)
    if (!roomSnap.exists()) {
      toast.add({ severity:'error', summary:'Ошибка', detail:'Комната больше не существует', life:3000 })
      return
    }
    if (roomSnap.data().status !== 'lobby') {
      toast.add({ severity:'warn', summary:'Поздно', detail:'Игра уже началась', life:3000 })
      return
    }

    const playersSnap = await getDocs(collection(db, 'rooms', room.id, 'players'))
    const maxPlayers = roomSnap.data().maxPlayers ?? 12
    if (playersSnap.size >= maxPlayers) {
      toast.add({ severity:'warn', summary:'Заполнено', detail:'Комната заполнена', life:3000 })
      return
    }

    const uid = auth.currentUser.uid
    const playerRef  = doc(db, 'rooms', room.id, 'players', uid)
    const playerSnap = await getDoc(playerRef)
    if (!playerSnap.exists()) {
      await setDoc(playerRef, {
        name: store.currentUser.nickname,
        isHost: false,
        uid,
        joinedAt: new Date(),
        isAnonymous: !!auth.currentUser.isAnonymous,
      })
    }
    router.push({ name: 'lobby', params: { id: room.id } })
  } catch (e) {
    console.error(e)
    toast.add({ severity:'error', summary:'Ошибка', detail:'Не удалось войти', life:3000 })
  } finally {
    joining.value = null
  }
}

const playerCount = (r) => r.playerCount ?? 0
const packLabel   = (r) => (r.packId || r.pack) === 'adult' ? '🔞 18+' : '📦 Standard'
const isFull      = (r) => playerCount(r) >= (r.maxPlayers ?? 12)

const formatAge = (ts) => {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  const mins = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000))
  if (mins < 1)  return 'только что'
  if (mins < 60) return `${mins} мин. назад`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} ч. назад`
  return d.toLocaleDateString('ru-RU', { day:'2-digit', month:'short' })
}
</script>

<template>
  <div class="lobbies-page">
    <header class="page-head">
      <div>
        <h1>🌐 Публичные лобби</h1>
        <p class="sub">Открытые комнаты, куда можно зайти без кода</p>
      </div>
      <Button label="Создать свою" severity="danger" icon="pi pi-plus"
        @click="router.push({ name: 'home' })" />
    </header>

    <!-- ═══ Фильтры ═══ -->
    <div class="filters">
      <InputText
        v-model="searchTerm" placeholder="🔍 Поиск по имени / коду / хосту"
        class="search-input"
      />
      <div class="pack-filter">
        <button class="f-btn" :class="{ active: packFilter === 'all' }"      @click="packFilter = 'all'">Все</button>
        <button class="f-btn" :class="{ active: packFilter === 'standard' }" @click="packFilter = 'standard'">📦 Standard</button>
        <button class="f-btn" :class="{ active: packFilter === 'adult' }"    @click="packFilter = 'adult'">🔞 18+</button>
      </div>
    </div>

    <!-- ═══ Список ═══ -->
    <div v-if="loading" class="empty">Загрузка лобби…</div>
    <div v-else-if="!filtered.length" class="empty">
      <div class="empty-icon">🕸️</div>
      <h3>Нет активных публичных лобби</h3>
      <p>Создайте свою комнату и отметьте её публичной — другие смогут присоединиться.</p>
      <Button label="Создать комнату" severity="danger" icon="pi pi-plus"
        @click="router.push({ name: 'home' })" />
    </div>

    <div v-else class="rooms-grid">
      <article
        v-for="r in filtered" :key="r.id"
        class="room-card"
        :class="{ full: isFull(r) }"
      >
        <header class="room-head">
          <h3 class="room-name">{{ r.name || 'Комната без названия' }}</h3>
          <Tag :value="packLabel(r)" severity="secondary" class="room-pack" />
        </header>

        <div class="room-meta">
          <span class="meta">
            <i class="pi pi-users" />
            {{ playerCount(r) }} / {{ r.maxPlayers ?? 12 }}
          </span>
          <span class="meta">
            <i class="pi pi-user" />
            {{ r.hostName || '—' }}
          </span>
          <span class="meta muted">{{ formatAge(r.createdAt) }}</span>
        </div>

        <div class="room-footer">
          <span class="code">#{{ r.id }}</span>
          <Button
            :label="isFull(r) ? 'Заполнено' : 'Войти'"
            :severity="isFull(r) ? 'secondary' : 'danger'"
            size="small"
            :disabled="isFull(r)"
            :loading="joining === r.id"
            icon="pi pi-sign-in"
            @click="joinRoom(r)"
          />
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.lobbies-page {
  max-width: 1100px; margin: 0 auto; padding: 1.5rem 1rem;
  display: flex; flex-direction: column; gap: 1.25rem;
}

.page-head {
  display: flex; justify-content: space-between; align-items: flex-end; gap: 1rem;
  flex-wrap: wrap;
}
.page-head h1  { font-size: 1.8rem; color: var(--color-accent); letter-spacing: 2px; }
.page-head .sub { color: var(--color-muted); font-size: 0.9rem; }

/* ─── Фильтры ─── */
.filters {
  display: flex; gap: 0.75rem; flex-wrap: wrap;
  align-items: center;
}
.search-input { flex: 1; min-width: 220px; }
.pack-filter  { display: flex; gap: 0.35rem; }
.f-btn {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  color: var(--color-muted);
  padding: 0.45rem 0.85rem;
  border-radius: var(--radius-sm);
  font-size: 0.85rem; cursor: pointer;
  transition: all 0.18s;
}
.f-btn:hover  { color: var(--color-text); border-color: #555; }
.f-btn.active {
  background: var(--color-accent-dim);
  border-color: var(--color-accent);
  color: var(--color-accent); font-weight: 700;
}

/* ─── Список ─── */
.rooms-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 0.85rem;
}
.room-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 1rem 1.1rem;
  display: flex; flex-direction: column; gap: 0.75rem;
  transition: all 0.2s;
}
.room-card:hover:not(.full) {
  border-color: var(--color-accent);
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(229,62,62,0.1);
}
.room-card.full { opacity: 0.6; }

.room-head {
  display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem;
}
.room-name {
  font-size: 1.05rem; color: var(--color-text);
  line-height: 1.3; word-break: break-word;
}
.room-pack :deep(.p-tag) { font-size: 0.7rem; }

.room-meta {
  display: flex; flex-wrap: wrap; gap: 0.75rem;
  color: var(--color-muted); font-size: 0.8rem;
}
.meta { display: flex; align-items: center; gap: 0.35rem; }
.meta .pi { font-size: 0.8rem; }
.meta.muted { color: #555; }

.room-footer {
  display: flex; justify-content: space-between; align-items: center;
  padding-top: 0.5rem;
  border-top: 1px dashed var(--color-border);
}
.code {
  font-family: 'Russo One', monospace;
  color: var(--color-warn); font-size: 0.95rem; letter-spacing: 2px;
}

/* ─── Пусто ─── */
.empty {
  text-align: center;
  padding: 4rem 1.5rem;
  background: var(--color-surface);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-lg);
  color: var(--color-muted);
}
.empty-icon { font-size: 3rem; margin-bottom: 1rem; opacity: 0.5; }
.empty h3   { color: var(--color-text); margin-bottom: 0.5rem; }
.empty p    { margin-bottom: 1.5rem; }

/* ─── Mobile ─── */
@media (max-width: 600px) {
  .page-head    { flex-direction: column; align-items: flex-start; }
  .page-head h1 { font-size: 1.4rem; }
  .filters      { flex-direction: column; align-items: stretch; }
  .pack-filter  { justify-content: space-between; }
  .f-btn        { flex: 1; font-size: 0.8rem; padding: 0.45rem 0.5rem; }
  .rooms-grid   { grid-template-columns: 1fr; }
}
</style>
