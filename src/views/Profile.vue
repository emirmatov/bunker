<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { db, auth } from '../firebase'
import {
  doc, getDoc, setDoc, deleteDoc, collection, onSnapshot,
  serverTimestamp, query, orderBy, limit, getDocs,
} from 'firebase/firestore'
import Button    from 'primevue/button'
import InputText from 'primevue/inputtext'
import Textarea  from 'primevue/textarea'
import Tag       from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import { useGameStore } from '../stores/game'

defineOptions({ name: 'ProfileView' })

const route   = useRoute()
const router  = useRouter()
const toast   = useToast()
const store   = useGameStore()

// Если uid не передан — показываем свой профиль
const viewedUid = computed(() => route.params.uid || store.currentUser?.uid || null)
const isOwn     = computed(() => viewedUid.value === store.currentUser?.uid)

const profile   = ref(null)        // { nickname, avatar, bio, stats, isAnonymous, createdAt }
const loading   = ref(true)
const notFound  = ref(false)

// ─── Редактирование ──────────────────────────────────────────
const editing  = ref(false)
const form     = ref({ nickname: '', avatar: '', bio: '' })
const saving   = ref(false)

const AVATAR_CHOICES = [
  '🧍','👤','🕶️','🎭','💀','☠️','👽','🤖','🎃','👻',
  '🦾','🧬','☢️','🛡️','⚡','🔥','🌪️','🚀','🎯','🦠',
  '🧪','⚔️','🗡️','🎲','🃏','🎩','🎨','💣','🧟','🧙',
]

// ─── Друзья ──────────────────────────────────────────────────
const friends       = ref([])       // [{ peerUid, status, direction, since, peerProfile }]
const friendLoading = ref(false)

// Статус текущего пользователя относительно viewedUid
const myRelation = computed(() => {
  if (!isOwn.value && store.currentUser?.uid) {
    const item = myFriendsRaw.value.find(f => f.peerUid === viewedUid.value)
    return item?.status || null   // 'pending'|'accepted'|null
  }
  return null
})
const myFriendsRaw = ref([])   // мой свежий список (для определения myRelation когда смотришь чужой профиль)

// ─── История игр ─────────────────────────────────────────────
const history = ref([])
const histLoading = ref(false)

// ─── Tabs ────────────────────────────────────────────────────
const tab = ref('stats')  // 'stats' | 'friends' | 'history'

// ─── Загрузка профиля ────────────────────────────────────────
let unsubFriends = null

const loadProfile = async () => {
  loading.value = true
  notFound.value = false
  try {
    const snap = await getDoc(doc(db, 'users', viewedUid.value))
    if (!snap.exists()) {
      notFound.value = true
      return
    }
    profile.value = snap.data()
    form.value = {
      nickname: profile.value.nickname ?? '',
      avatar:   profile.value.avatar   ?? '🧍',
      bio:      profile.value.bio      ?? '',
    }
  } finally {
    loading.value = false
  }
}

const loadMyFriendsRaw = () => {
  if (!store.currentUser) return
  const ref = collection(db, 'users', store.currentUser.uid, 'friends')
  onSnapshot(ref, (snap) => {
    myFriendsRaw.value = snap.docs.map(d => ({ peerUid: d.id, ...d.data() }))
  })
}

const loadFriends = () => {
  if (!viewedUid.value) return
  unsubFriends?.()
  friendLoading.value = true
  const ref = collection(db, 'users', viewedUid.value, 'friends')
  unsubFriends = onSnapshot(ref, async (snap) => {
    // Подгружаем профили друзей
    const rows = await Promise.all(
      snap.docs.map(async (d) => {
        const data = d.data()
        let peerProfile = null
        try {
          const ps = await getDoc(doc(db, 'users', d.id))
          if (ps.exists()) peerProfile = ps.data()
        } catch {/* no access */}
        return { peerUid: d.id, ...data, peerProfile }
      })
    )
    friends.value = rows
    friendLoading.value = false
  }, () => { friendLoading.value = false })
}

const loadHistory = async () => {
  histLoading.value = true
  try {
    const q = query(
      collection(db, 'users', viewedUid.value, 'gameHistory'),
      orderBy('endedAt', 'desc'),
      limit(20),
    )
    const snap = await getDocs(q)
    history.value = snap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch {
    history.value = []
  } finally {
    histLoading.value = false
  }
}

watch(viewedUid, (uid) => {
  if (uid) {
    loadProfile()
    loadFriends()
  }
}, { immediate: true })

onMounted(() => {
  loadMyFriendsRaw()
  if (viewedUid.value) loadHistory()
})
onUnmounted(() => unsubFriends?.())

watch(tab, (t) => {
  if (t === 'history' && !history.value.length) loadHistory()
})

// ─── Сохранение своего профиля ───────────────────────────────
const saveProfile = async () => {
  const nick = form.value.nickname.trim()
  if (nick.length < 2)  return toast.add({ severity:'error', summary:'Ошибка', detail:'Никнейм минимум 2 символа', life:3000 })
  if (nick.length > 20) return toast.add({ severity:'error', summary:'Ошибка', detail:'Никнейм максимум 20', life:3000 })
  if (form.value.bio.length > 200) return toast.add({ severity:'error', summary:'Ошибка', detail:'Bio максимум 200 символов', life:3000 })

  saving.value = true
  try {
    const patch = {
      nickname: nick,
      avatar: form.value.avatar || '🧍',
      bio: form.value.bio.trim(),
      updatedAt: serverTimestamp(),
    }
    await setDoc(doc(db, 'users', store.currentUser.uid), patch, { merge: true })
    store.patchProfile(patch)
    profile.value = { ...profile.value, ...patch }
    editing.value = false
    toast.add({ severity:'success', summary:'Сохранено', life:2000 })
  } catch (e) {
    console.error(e)
    toast.add({ severity:'error', summary:'Ошибка', detail:'Не удалось сохранить', life:3000 })
  } finally {
    saving.value = false
  }
}

// ─── Действия с друзьями ─────────────────────────────────────
const sendFriendRequest = async () => {
  if (!store.currentUser || isOwn.value) return
  if (store.currentUser.isAnonymous) {
    toast.add({ severity:'warn', summary:'Недоступно', detail:'Инкогнито-пользователи не могут добавлять в друзья', life:3000 })
    return
  }
  if (profile.value?.isAnonymous) {
    toast.add({ severity:'warn', summary:'Недоступно', detail:'Этот пользователь зашёл инкогнито', life:3000 })
    return
  }
  const myUid = store.currentUser.uid
  const peerUid = viewedUid.value
  try {
    // Пишем в свой список: outgoing pending
    await setDoc(doc(db, 'users', myUid, 'friends', peerUid), {
      status: 'pending',
      direction: 'outgoing',
      since: serverTimestamp(),
    })
    // И в список получателя: incoming pending (docId = myUid — правила разрешают)
    await setDoc(doc(db, 'users', peerUid, 'friends', myUid), {
      status: 'pending',
      direction: 'incoming',
      since: serverTimestamp(),
    })
    toast.add({ severity:'success', summary:'Заявка отправлена', life:2000 })
  } catch (e) {
    console.error(e)
    toast.add({ severity:'error', summary:'Ошибка', detail:'Не удалось отправить заявку', life:3000 })
  }
}

const acceptFriendRequest = async (peerUid) => {
  const myUid = store.currentUser.uid
  try {
    await setDoc(doc(db, 'users', myUid, 'friends', peerUid), {
      status: 'accepted', since: serverTimestamp(),
    }, { merge: true })
    await setDoc(doc(db, 'users', peerUid, 'friends', myUid), {
      status: 'accepted',
    }, { merge: true })
    toast.add({ severity:'success', summary:'Теперь вы друзья!', life:2000 })
  } catch (e) {
    console.error(e)
    toast.add({ severity:'error', summary:'Ошибка', detail:'Не удалось принять заявку', life:3000 })
  }
}

const removeFriend = async (peerUid) => {
  const myUid = store.currentUser.uid
  try {
    await deleteDoc(doc(db, 'users', myUid, 'friends', peerUid))
    // Документ в списке собеседника удалить не можем по правилам — он будет висеть как pending,
    // но при отображении фильтруется. Для полной синхронизации нужны Cloud Functions.
    toast.add({ severity:'info', summary:'Удалено из друзей', life:2000 })
  } catch (e) {
    console.error(e)
  }
}

const openProfile = (uid) => router.push({ name: 'profile', params: { uid } })

// ─── Вычисления статистики ───────────────────────────────────
const stats = computed(() => profile.value?.stats ?? {
  gamesPlayed: 0, wins: 0, survived: 0, votedOut: 0, killed: 0,
})
const winRate = computed(() => {
  const g = stats.value.gamesPlayed
  if (!g) return 0
  return Math.round((stats.value.wins / g) * 100)
})
const survivalRate = computed(() => {
  const g = stats.value.gamesPlayed
  if (!g) return 0
  return Math.round((stats.value.survived / g) * 100)
})

const acceptedFriends = computed(() => friends.value.filter(f => f.status === 'accepted'))
const incomingRequests = computed(() =>
  friends.value.filter(f => f.status === 'pending' && f.direction === 'incoming')
)
const outgoingRequests = computed(() =>
  friends.value.filter(f => f.status === 'pending' && f.direction === 'outgoing')
)

const formatDate = (ts) => {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('ru-RU', { day:'2-digit', month:'short', year:'numeric' })
}
</script>

<template>
  <div class="profile-page">
    <!-- Загрузка / 404 -->
    <div v-if="loading" class="state-card">Загрузка профиля…</div>
    <div v-else-if="notFound" class="state-card error">
      <h2>Профиль не найден</h2>
      <Button label="На главную" @click="router.push({ name: 'home' })" />
    </div>

    <template v-else>
      <!-- ═══ Шапка профиля ═══ -->
      <section class="profile-head">
        <div class="avatar-big">{{ profile.avatar || '🧍' }}</div>
        <div class="head-info">
          <div class="name-row">
            <h1 class="nickname">{{ profile.nickname || 'Без позывного' }}</h1>
            <Tag v-if="profile.isAnonymous" value="🕶️ Инкогнито" severity="secondary" />
          </div>
          <p v-if="profile.bio" class="bio">{{ profile.bio }}</p>
          <p v-else-if="isOwn" class="bio muted">Добавьте описание о себе</p>

          <div class="profile-actions">
            <template v-if="isOwn">
              <Button
                v-if="!editing" label="Редактировать" icon="pi pi-pencil"
                severity="secondary" size="small" @click="editing = true"
              />
            </template>
            <template v-else-if="store.currentUser">
              <Tag
                v-if="store.currentUser.isAnonymous"
                value="🕶️ Зарегистрируйтесь, чтобы добавлять в друзья"
                severity="secondary"
              />
              <Tag
                v-else-if="profile.isAnonymous"
                value="🕶️ Инкогнито-пользователя нельзя добавить"
                severity="secondary"
              />
              <Button
                v-else-if="!myRelation"
                label="Добавить в друзья" icon="pi pi-user-plus"
                severity="danger" size="small" @click="sendFriendRequest"
              />
              <Tag v-else-if="myRelation === 'pending'" value="⏳ Заявка отправлена" severity="warn" />
              <Tag v-else-if="myRelation === 'accepted'" value="✓ В друзьях" severity="success" />
            </template>
          </div>
        </div>
      </section>

      <!-- ═══ Форма редактирования ═══ -->
      <section v-if="editing" class="edit-card">
        <h3>✏️ Редактировать профиль</h3>

        <div class="field">
          <label>Аватар</label>
          <div class="avatar-grid">
            <button
              v-for="emoji in AVATAR_CHOICES" :key="emoji"
              class="avatar-pick"
              :class="{ active: form.avatar === emoji }"
              @click="form.avatar = emoji"
            >{{ emoji }}</button>
          </div>
        </div>

        <div class="field">
          <label>Позывной</label>
          <InputText v-model="form.nickname" maxlength="20" class="w-full" />
        </div>

        <div class="field">
          <label>О себе ({{ form.bio.length }}/200)</label>
          <Textarea v-model="form.bio" rows="3" maxlength="200" class="w-full"
            placeholder="Пару слов о себе для друзей…" />
        </div>

        <div class="edit-actions">
          <Button label="Отмена" severity="secondary" outlined @click="editing = false" :disabled="saving" />
          <Button label="Сохранить" severity="danger" :loading="saving" @click="saveProfile" />
        </div>
      </section>

      <!-- ═══ Tabs ═══ -->
      <nav class="tabs">
        <button class="tab" :class="{ active: tab === 'stats' }"   @click="tab = 'stats'">📊 Статистика</button>
        <button class="tab" :class="{ active: tab === 'friends' }" @click="tab = 'friends'">
          👥 Друзья
          <span v-if="isOwn && incomingRequests.length" class="badge">{{ incomingRequests.length }}</span>
        </button>
        <button class="tab" :class="{ active: tab === 'history' }" @click="tab = 'history'">📜 История</button>
      </nav>

      <!-- ═══ Статистика ═══ -->
      <section v-if="tab === 'stats'" class="stats-grid">
        <div class="stat-card"><span class="stat-value">{{ stats.gamesPlayed }}</span><span class="stat-label">Всего игр</span></div>
        <div class="stat-card win"><span class="stat-value">{{ stats.wins }}</span><span class="stat-label">Побед</span></div>
        <div class="stat-card"><span class="stat-value">{{ winRate }}%</span><span class="stat-label">Винрейт</span></div>
        <div class="stat-card survive"><span class="stat-value">{{ stats.survived }}</span><span class="stat-label">Выжил</span></div>
        <div class="stat-card"><span class="stat-value">{{ survivalRate }}%</span><span class="stat-label">Выживаемость</span></div>
        <div class="stat-card danger"><span class="stat-value">{{ stats.votedOut }}</span><span class="stat-label">Изгнан</span></div>
        <div class="stat-card danger"><span class="stat-value">{{ stats.killed }}</span><span class="stat-label">Убит</span></div>
      </section>

      <!-- ═══ Друзья ═══ -->
      <section v-else-if="tab === 'friends'" class="friends-block">
        <!-- Входящие заявки (только на своём профиле) -->
        <div v-if="isOwn && incomingRequests.length" class="friend-section">
          <h3>📨 Входящие заявки</h3>
          <div
            v-for="f in incomingRequests" :key="f.peerUid"
            class="friend-row"
          >
            <button class="friend-info" @click="openProfile(f.peerUid)">
              <span class="friend-avatar">{{ f.peerProfile?.avatar || '🧍' }}</span>
              <span class="friend-name">{{ f.peerProfile?.nickname || f.peerUid.slice(0,8) }}</span>
            </button>
            <div class="friend-actions">
              <Button label="Принять" severity="success" size="small" @click="acceptFriendRequest(f.peerUid)" />
              <Button icon="pi pi-times" severity="secondary" size="small" outlined @click="removeFriend(f.peerUid)" />
            </div>
          </div>
        </div>

        <!-- Исходящие -->
        <div v-if="isOwn && outgoingRequests.length" class="friend-section">
          <h3>✉️ Отправленные заявки</h3>
          <div v-for="f in outgoingRequests" :key="f.peerUid" class="friend-row">
            <button class="friend-info" @click="openProfile(f.peerUid)">
              <span class="friend-avatar">{{ f.peerProfile?.avatar || '🧍' }}</span>
              <span class="friend-name">{{ f.peerProfile?.nickname || f.peerUid.slice(0,8) }}</span>
              <span class="friend-sub">Ожидание…</span>
            </button>
            <Button icon="pi pi-times" severity="secondary" size="small" outlined @click="removeFriend(f.peerUid)" />
          </div>
        </div>

        <!-- Принятые -->
        <div class="friend-section">
          <h3>👥 Друзья <span class="count">{{ acceptedFriends.length }}</span></h3>
          <div v-if="!acceptedFriends.length" class="empty">
            {{ isOwn ? 'Пока никого. Заходите на профили других игроков и добавляйтесь!' : 'Нет друзей' }}
          </div>
          <div
            v-for="f in acceptedFriends" :key="f.peerUid"
            class="friend-row"
          >
            <button class="friend-info" @click="openProfile(f.peerUid)">
              <span class="friend-avatar">{{ f.peerProfile?.avatar || '🧍' }}</span>
              <span class="friend-name">{{ f.peerProfile?.nickname || f.peerUid.slice(0,8) }}</span>
              <span v-if="f.peerProfile?.bio" class="friend-sub">{{ f.peerProfile.bio }}</span>
            </button>
            <Button
              v-if="isOwn" icon="pi pi-trash"
              severity="secondary" size="small" outlined
              v-tooltip.top="'Удалить из друзей'"
              @click="removeFriend(f.peerUid)"
            />
          </div>
        </div>
      </section>

      <!-- ═══ История ═══ -->
      <section v-else-if="tab === 'history'" class="history-block">
        <div v-if="histLoading" class="empty">Загрузка…</div>
        <div v-else-if="!history.length" class="empty">
          {{ isOwn ? 'Вы ещё не сыграли ни одной игры.' : 'История недоступна' }}
        </div>
        <div v-else class="history-list">
          <div v-for="g in history" :key="g.id" class="history-row">
            <div class="h-icon" :class="g.outcome">
              {{ g.outcome === 'win' ? '🏆' : g.outcome === 'survived' ? '🛡️' : g.outcome === 'killed' ? '💀' : '🚫' }}
            </div>
            <div class="h-main">
              <div class="h-title">
                {{ g.outcome === 'win' ? 'Победа' :
                   g.outcome === 'survived' ? 'Выжил' :
                   g.outcome === 'killed' ? 'Убит' : 'Изгнан' }}
              </div>
              <div class="h-sub">
                {{ g.playerCount }} игроков · {{ g.pack || 'standard' }}
              </div>
            </div>
            <div class="h-date">{{ formatDate(g.endedAt) }}</div>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.profile-page {
  max-width: 820px; margin: 0 auto; padding: 1.5rem 1rem;
  display: flex; flex-direction: column; gap: 1.25rem;
}

.state-card {
  background: var(--color-surface); padding: 3rem 1.5rem;
  border-radius: var(--radius-lg); text-align: center;
  color: var(--color-muted);
}
.state-card.error h2 { color: var(--color-accent); margin-bottom: 1rem; }

/* ─── Шапка ─── */
.profile-head {
  display: flex; gap: 1.5rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 1.75rem;
}
.avatar-big {
  width: 96px; height: 96px; flex-shrink: 0;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(229,62,62,0.2), rgba(229,62,62,0.05));
  border: 2px solid var(--color-accent);
  display: flex; align-items: center; justify-content: center;
  font-size: 3rem;
}
.head-info { flex: 1; display: flex; flex-direction: column; gap: 0.5rem; min-width: 0; }
.name-row  { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
.nickname  { font-size: 1.75rem; color: var(--color-accent); font-family: 'Russo One', sans-serif; letter-spacing: 2px; }
.bio       { color: var(--color-text); font-size: 0.95rem; line-height: 1.5; }
.bio.muted { color: var(--color-muted); font-style: italic; }
.profile-actions { margin-top: 0.5rem; display: flex; gap: 0.5rem; flex-wrap: wrap; }

/* ─── Редактирование ─── */
.edit-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem;
}
.edit-card h3 { color: var(--color-accent); }
.field        { display: flex; flex-direction: column; gap: 0.4rem; }
.field label  { color: var(--color-muted); font-size: 0.85rem; }
.edit-actions { display: flex; justify-content: flex-end; gap: 0.5rem; }

.avatar-grid {
  display: grid; grid-template-columns: repeat(10, 1fr);
  gap: 0.35rem;
}
.avatar-pick {
  aspect-ratio: 1;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-size: 1.4rem; cursor: pointer;
  transition: all 0.15s;
}
.avatar-pick:hover { border-color: var(--color-accent); transform: scale(1.05); }
.avatar-pick.active {
  border-color: var(--color-accent);
  background: var(--color-accent-dim);
  box-shadow: 0 0 0 2px var(--color-accent);
}

/* ─── Tabs ─── */
.tabs {
  display: flex; gap: 0.25rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 0.35rem;
}
.tab {
  flex: 1; padding: 0.6rem 0.75rem;
  background: none; border: none; cursor: pointer;
  color: var(--color-muted); font-size: 0.9rem; font-weight: 600;
  border-radius: var(--radius-sm);
  position: relative;
  transition: all 0.18s;
}
.tab:hover  { color: var(--color-text); background: var(--color-bg); }
.tab.active { color: var(--color-accent); background: var(--color-accent-dim); }
.badge {
  display: inline-block; margin-left: 0.35rem;
  background: var(--color-accent); color: #fff;
  font-size: 0.7rem; font-weight: 700;
  padding: 0.1rem 0.4rem; border-radius: 999px;
}

/* ─── Stats ─── */
.stats-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.75rem;
}
.stat-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 1.25rem 1rem;
  display: flex; flex-direction: column; align-items: center; gap: 0.3rem;
  transition: border-color 0.2s;
}
.stat-card:hover        { border-color: #444; }
.stat-card.win          { border-color: rgba(74,222,128,0.4); background: rgba(74,222,128,0.05); }
.stat-card.survive      { border-color: rgba(96,165,250,0.4); background: rgba(96,165,250,0.05); }
.stat-card.danger       { border-color: rgba(229,62,62,0.4);  background: rgba(229,62,62,0.05); }
.stat-value {
  font-family: 'Russo One', sans-serif;
  font-size: 1.8rem; color: var(--color-text);
}
.stat-label { color: var(--color-muted); font-size: 0.8rem; text-align: center; }

/* ─── Friends ─── */
.friends-block   { display: flex; flex-direction: column; gap: 1.25rem; }
.friend-section h3 {
  font-size: 1rem; color: var(--color-muted);
  letter-spacing: 1px; margin-bottom: 0.6rem;
  display: flex; align-items: center; gap: 0.5rem;
}
.count {
  background: var(--color-bg); color: var(--color-muted);
  padding: 0.1rem 0.5rem; border-radius: 999px; font-size: 0.75rem;
}
.friend-row {
  display: flex; align-items: center; gap: 0.75rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 0.6rem 0.85rem;
  margin-bottom: 0.5rem;
}
.friend-info {
  display: flex; align-items: center; gap: 0.75rem;
  flex: 1; background: none; border: none;
  color: var(--color-text); cursor: pointer;
  padding: 0; text-align: left; min-width: 0;
}
.friend-info:hover .friend-name { color: var(--color-accent); }
.friend-avatar {
  width: 36px; height: 36px; border-radius: 50%;
  background: var(--color-accent-dim); border: 1px solid var(--color-accent);
  display: flex; align-items: center; justify-content: center;
  font-size: 1.1rem; flex-shrink: 0;
}
.friend-name { font-weight: 600; font-size: 0.95rem; transition: color 0.15s; }
.friend-sub  {
  color: var(--color-muted); font-size: 0.8rem;
  margin-left: 0.5rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.friend-actions { display: flex; gap: 0.4rem; }

.empty {
  text-align: center; padding: 2rem 1rem;
  color: var(--color-muted); font-size: 0.9rem;
  background: var(--color-surface); border-radius: var(--radius-md);
  border: 1px dashed var(--color-border);
}

/* ─── History ─── */
.history-list { display: flex; flex-direction: column; gap: 0.5rem; }
.history-row {
  display: flex; align-items: center; gap: 1rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 0.75rem 1rem;
}
.h-icon {
  width: 44px; height: 44px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 1.3rem; background: var(--color-bg); border: 1px solid var(--color-border);
  flex-shrink: 0;
}
.h-icon.win      { background: rgba(74,222,128,0.1);  border-color: rgba(74,222,128,0.4); }
.h-icon.survived { background: rgba(96,165,250,0.1); border-color: rgba(96,165,250,0.4); }
.h-icon.killed   { background: rgba(229,62,62,0.1);  border-color: rgba(229,62,62,0.4); }
.h-icon.votedOut { background: rgba(245,158,11,0.1); border-color: rgba(245,158,11,0.4); }
.h-main { flex: 1; min-width: 0; }
.h-title { font-weight: 600; }
.h-sub   { color: var(--color-muted); font-size: 0.8rem; }
.h-date  { color: var(--color-muted); font-size: 0.8rem; flex-shrink: 0; }

/* ─── Mobile ─── */
@media (max-width: 600px) {
  .profile-head    { flex-direction: column; align-items: center; text-align: center; padding: 1.25rem; }
  .avatar-big      { width: 80px; height: 80px; font-size: 2.5rem; }
  .nickname        { font-size: 1.4rem; }
  .name-row        { justify-content: center; }
  .profile-actions { justify-content: center; }
  .avatar-grid     { grid-template-columns: repeat(8, 1fr); }
  .tab             { font-size: 0.8rem; padding: 0.5rem 0.4rem; }
  .stats-grid      { grid-template-columns: repeat(2, 1fr); gap: 0.5rem; }
  .stat-card       { padding: 1rem 0.5rem; }
  .stat-value      { font-size: 1.5rem; }
}
</style>
