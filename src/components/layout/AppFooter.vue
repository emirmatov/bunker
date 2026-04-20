<script setup>
const year = new Date().getFullYear()
</script>

<template>
  <footer class="site-footer">
    <div class="footer-inner">
      <div class="footer-col brand-col">
        <div class="footer-brand">
          <span class="f-icon">☢️</span>
          <span class="f-name">БУНКЕР</span>
        </div>
        <p class="footer-tagline">
          Социальная игра на выживание. Убеди остальных, что именно ты достоин места в бункере.
        </p>
      </div>

      <div class="footer-col">
        <h4 class="footer-title">Игра</h4>
        <router-link to="/"        class="footer-link">Играть онлайн</router-link>
        <router-link to="/rules"   class="footer-link">Правила</router-link>
        <router-link to="/about"   class="footer-link">О проекте</router-link>
      </div>

      <div class="footer-col">
        <h4 class="footer-title">Сообщество</h4>
        <a href="https://t.me/" target="_blank" rel="noopener" class="footer-link">Telegram-канал</a>
        <a href="https://discord.com/" target="_blank" rel="noopener" class="footer-link">Discord-сервер</a>
        <a href="mailto:feedback@bunker.game" class="footer-link">Обратная связь</a>
      </div>

      <div class="footer-col">
        <h4 class="footer-title">Правовое</h4>
        <router-link to="/rules" class="footer-link">Пользовательское соглашение</router-link>
        <router-link to="/rules" class="footer-link">Политика конфиденциальности</router-link>
        <span class="footer-note">16+. Контент может быть неприемлемым для несовершеннолетних.</span>
      </div>
    </div>

    <div class="footer-bottom">
      <span>© {{ year }} Бункер. Все права защищены.</span>
      <span class="dot">•</span>
      <span>Сделано с ☢️ и  ☕</span>
    </div>
  </footer>
</template>

<style scoped>
.site-footer {
  margin-top: 4rem;
  background: #0a0a0a;
  border-top: 1px solid var(--color-border);
  padding: 3rem 1.5rem 1.5rem;
}
.footer-inner {
  max-width: 1200px; margin: 0 auto;
  display: grid;
  grid-template-columns: 1.5fr 1fr 1fr 1fr;
  gap: 2.5rem;
}
.footer-col       { display: flex; flex-direction: column; gap: 0.6rem; }
.brand-col        { max-width: 320px; }
.footer-brand     { display: flex; align-items: center; gap: 0.5rem; font-family: 'Russo One', sans-serif; font-size: 1.3rem; letter-spacing: 2px; }
.f-name           { color: var(--color-accent); }
.f-icon           { filter: drop-shadow(0 0 10px rgba(229,62,62,0.5)); }
.footer-tagline   { color: var(--color-muted); font-size: 0.88rem; line-height: 1.6; margin-top: 0.25rem; }

.footer-title {
  font-family: 'Russo One', sans-serif;
  font-size: 0.85rem; letter-spacing: 2px;
  color: var(--color-text); text-transform: uppercase;
  margin-bottom: 0.4rem;
}
.footer-link {
  color: var(--color-muted); text-decoration: none; font-size: 0.88rem;
  transition: color 0.2s;
}
.footer-link:hover { color: var(--color-accent); }
.footer-note       { color: #555; font-size: 0.75rem; line-height: 1.5; margin-top: 0.25rem; }

.footer-bottom {
  max-width: 1200px; margin: 2.5rem auto 0;
  padding-top: 1.5rem;
  border-top: 1px solid var(--color-border);
  display: flex; justify-content: center; gap: 0.75rem; flex-wrap: wrap;
  color: #555; font-size: 0.8rem;
}
.dot { color: #333; }

@media (max-width: 768px) {
  .footer-inner { grid-template-columns: 1fr 1fr; gap: 1.75rem; }
  .brand-col    { grid-column: 1 / -1; max-width: none; }
}
@media (max-width: 480px) {
  .footer-inner { grid-template-columns: 1fr; }
}
</style>
