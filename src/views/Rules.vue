<script setup>
defineOptions({ name: 'RulesView' })
</script>

<template>
  <div class="page">
    <div class="hero-mini">
      <div class="icon">📜</div>
      <h1>ПРАВИЛА</h1>
      <p class="sub">Как выжить в бункере</p>
    </div>

    <section class="card">
      <h2>☢️ Завязка</h2>
      <p>
        На Земле случилась катастрофа. В бункере есть ограниченное число мест — обычно половина от
        количества игроков. Остальные останутся снаружи и погибнут.
      </p>
    </section>

    <section class="card">
      <h2>🎴 Ваша карточка</h2>
      <p>
        Каждому игроку выдаётся тайная карточка с характеристиками:
      </p>
      <ul>
        <li><strong>Профессия</strong> — что вы умеете делать</li>
        <li><strong>Биология</strong> — пол, возраст, здоровье репродуктивной системы</li>
        <li><strong>Здоровье</strong> — хронические болезни и особенности</li>
        <li><strong>Хобби</strong> — чем вы занимаетесь в свободное время</li>
        <li><strong>Багаж</strong> и <strong>Крупный багаж</strong> — что вы берёте с собой</li>
        <li><strong>Факты</strong> — личные особенности, о которых стоит знать</li>
        <li><strong>Фобия</strong> — ваш страх</li>
        <li><strong>Спецкарты</strong> — активные способности (меняют ход игры)</li>
      </ul>
    </section>

    <section class="card">
      <h2>🔄 Ход игры</h2>
      <ol>
        <li>По очереди каждый игрок <strong>раскрывает одну карту</strong> по желанию.</li>
        <li>Можно аргументировать, почему именно вы нужны в бункере.</li>
        <li>После того как все сходили — <strong>голосование</strong>: кого НЕ возьмём?</li>
        <li>Набравший больше всех голосов изгоняется.</li>
        <li>Раунды повторяются, пока в бункере не останется ровно столько, сколько есть мест.</li>
      </ol>
    </section>

    <section class="card">
      <h2>⚡ Спецкарты</h2>
      <p>
        Спецкарты — ваш козырь. Они могут лечить, убивать, менять голоса, блокировать других,
        воскрешать изгнанных и многое другое. Используйте их в свой ход, нажимая на карту в досье.
      </p>
    </section>

    <section class="card">
      <h2>🏆 Победа</h2>
      <p>
        Побеждают те, кто попал в бункер. Остальные — проигрывают, но могут наблюдать за игрой
        в режиме зрителя.
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
.card ul, .card ol { color: #bbb; padding-left: 1.5rem; line-height: 1.8; }
.card li  { margin-bottom: 0.25rem; }
.card strong { color: var(--color-text); }
</style>
