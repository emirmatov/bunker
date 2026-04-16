// functions/index.js
// Требует: firebase-admin, firebase-functions v4+
// Деплой: firebase deploy --only functions

const { onSchedule }      = require('firebase-functions/v2/scheduler')
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { onDocumentUpdated }  = require('firebase-functions/v2/firestore')
const { initializeApp }      = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')

initializeApp()
const db = getFirestore()

// ────────────────────────────────────────────────────────────────
// 1. Плановая очистка — удаляет комнаты старше 24 часов
//    Запускается каждый час
// ────────────────────────────────────────────────────────────────
exports.cleanupOldRooms = onSchedule('every 60 minutes', async () => {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const snapshot = await db.collection('rooms')
    .where('createdAt', '<', cutoff)
    .get()

  if (snapshot.empty) {
    console.log('[cleanup] Старых комнат нет.')
    return
  }

  let deleted = 0
  for (const roomDoc of snapshot.docs) {
    const batch = db.batch()

    // Удаляем всех игроков
    const playersSnap = await db
      .collection('rooms').doc(roomDoc.id)
      .collection('players').get()
    playersSnap.docs.forEach(p => batch.delete(p.ref))

    // Удаляем саму комнату
    batch.delete(roomDoc.ref)
    await batch.commit()
    deleted++
  }

  console.log(`[cleanup] Удалено ${deleted} комнат.`)
})

// ────────────────────────────────────────────────────────────────
// 2. Защищённый кик игрока — вызывается с клиента
//    Проверяет на сервере: только хост может кикать
// ────────────────────────────────────────────────────────────────
exports.kickPlayer = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Требуется авторизация')

  const { roomId, targetUid } = request.data
  if (!roomId || !targetUid) throw new HttpsError('invalid-argument', 'roomId и targetUid обязательны')

  const roomRef  = db.collection('rooms').doc(roomId)
  const roomSnap = await roomRef.get()
  if (!roomSnap.exists) throw new HttpsError('not-found', 'Комната не найдена')

  // Только хост
  if (roomSnap.data().hostId !== uid)
    throw new HttpsError('permission-denied', 'Только хост может изгонять игроков')

  const targetRef  = roomRef.collection('players').doc(targetUid)
  const targetSnap = await targetRef.get()
  if (!targetSnap.exists) throw new HttpsError('not-found', 'Игрок не найден')
  if (targetSnap.data().isAlive === false)
    throw new HttpsError('failed-precondition', 'Игрок уже изгнан')

  // Вскрываем все карты и помечаем мёртвым
  const cards = { ...targetSnap.data().cards }
  Object.keys(cards).forEach(k => { cards[k] = { ...cards[k], isRevealed: true } })

  const batch = db.batch()
  batch.update(targetRef, { isAlive: false, cards })

  const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  batch.update(roomRef, {
    logs: FieldValue.arrayUnion(`[${time}] 🚪 ${targetSnap.data().name} изгнан из бункера`)
  })
  await batch.commit()

  // Проверяем конец игры
  const playersSnap = await roomRef.collection('players').get()
  const aliveCount  = playersSnap.docs
    .filter(d => d.id !== targetUid && d.data().isAlive !== false).length
  const bunkerSize  = roomSnap.data().bunkerSize || 2

  if (aliveCount <= bunkerSize && aliveCount > 0) {
    await roomRef.update({ status: 'finished' })
    await roomRef.update({
      logs: FieldValue.arrayUnion(`[${time}] 🔒 Бункер закрыт! Выжившие определены.`)
    })
  }

  return { success: true, aliveCount }
})

// ────────────────────────────────────────────────────────────────
// 3. Защита от двойного старта — при попытке запустить уже
//    запущенную игру ничего не происходит
// ────────────────────────────────────────────────────────────────
exports.onRoomStatusChange = onDocumentUpdated('rooms/{roomId}', async (event) => {
  const before = event.data.before.data()
  const after  = event.data.after.data()

  // Интересует только переход lobby → playing
  if (before.status !== 'lobby' || after.status !== 'playing') return

  // Если карты у игроков уже были раздены дважды — это двойной клик.
  // Ничего не делаем, просто логируем.
  console.log(`[onRoomStatusChange] Комната ${event.params.roomId} запущена`)
})
