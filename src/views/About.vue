<script setup>
defineOptions({ name: 'AboutView' })
</script>

<template>
  <div class="page">
    <div class="hero-mini">
      <div class="icon">💡</div>
      <h1>О ПРОЕКТЕ</h1>
      <p class="sub">Зачем мы сделали «Бункер»</p>
    </div>

    <section class="card">
      <h2>🎯 Идея</h2>
      <p>
        «Бункер» — цифровая реализация популярной социальной игры на выживание. Мы сделали её,
        чтобы можно было играть с друзьями онлайн — без распечаток, карточек и споров о правилах.
        Всё в одном месте: характеристики, голосование, спецкарты, таймер ходов.
      </p>
    </section>

    <section class="card">
      <h2>🚀 Что внутри</h2>
      <ul>
        <li>До <strong>12 игроков</strong> в одной комнате</li>
        <li>Два пака контента: <strong>стандартный</strong> и <strong>18+</strong></li>
        <li><strong>30+ спецкарт</strong>, которые меняют ход игры</li>
        <li>Настраиваемый таймер хода с паузой</li>
        <li>Режим наблюдателя после изгнания</li>
        <li>Журнал событий, чтобы не терять контекст</li>
      </ul>
    </section>

    <section class="card">
      <h2>🔐 Приватность</h2>
      <p>
        Мы не собираем лишних данных. Для входа нужен только email или Google-аккаунт —
        чтобы вы могли играть с одного устройства на другое и сохранять свой позывной.
        Никакой рекламы и трекеров.
      </p>
    </section>

    <section class="card">
      <h2>💌 Обратная связь</h2>
      <p>
        Нашли баг? Есть идея новой спецкарты? Хотите свой пак контента?
        Пишите на <a href="mailto:feedback@bunker.game">feedback@bunker.game</a> или в Telegram.
        Мы читаем всё.
      </p>
    </section>

    <section class="card support">
      <h2>☕ Поддержать</h2>
      <p>
        Сервер, домен, база данных — всё стоит денег. Если «Бункер» подарил вам пару весёлых
        вечеров, мы будем благодарны за поддержку. Она идёт целиком на развитие проекта.
      </p>
    </section>
  </div>
</template>

<style scoped>
.page { max-width: 800px; margin: 0 auto; padding: 2rem 1.5rem; }
.hero-mini { text-align: center; margin-bottom: 2.5rem; }
.icon      { font-size: 3rem; margin-bottom: 0.5rem; }
.hero-mini h1 { font-size: 2.5rem; color: var(--color-accent); letter-spacing: 3px; }
.sub          { color: var(--color-muted); margin-top: 0.25rem; }

.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 1.5rem 1.75rem;
  margin-bottom: 1rem;
}
.card h2  { font-size: 1.2rem; margin-bottom: 0.75rem; color: var(--color-text); }
.card p   { color: #bbb; line-height: 1.65; }
.card ul  { color: #bbb; padding-left: 1.5rem; line-height: 1.8; }
.card strong { color: var(--color-text); }
.card a      { color: var(--color-accent); text-decoration: none; }
.card a:hover{ text-decoration: underline; }

.support { border-color: var(--color-accent); background: linear-gradient(135deg, rgba(229,62,62,0.06) 0%, var(--color-surface) 60%); }
</style>
