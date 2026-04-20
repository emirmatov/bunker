# Безопасность

## ⚠️ Что НИКОГДА не коммитим в git

| Файл | Что это | Последствия утечки |
|---|---|---|
| `scripts/serviceAccount.json` | Firebase Admin SDK ключ | **Полный админский доступ к Firestore/Auth/Storage** |
| `firebase-adminsdk-*.json` | То же самое | — |
| `.env`, `.env.production`, `.env.local` | Конфиги окружения | В нашем случае — не критично, но держим вне git |
| `*.pem`, `*.key` | Приватные ключи | Любой сможет подписывать запросы от вашего имени |

Всё это уже в `.gitignore`. Проверить перед коммитом:
```bash
git status
git check-ignore -v scripts/serviceAccount.json .env
```

## 🔐 Firebase Web API Key — публичный или секретный?

**Публичный.** API-ключ в `src/firebase.js` (теперь `import.meta.env.VITE_FIREBASE_*`)
встраивается в клиентский JS-бандл и виден любому пользователю сайта. Это **идентификатор проекта**, а не пароль.

Защиту дают:
1. **Firestore Security Rules** (`firestore.rules`) — главный барьер
2. **Ограничение API-ключа по HTTP-referrer** в GCP Console
3. **App Check** (опционально) — проверка, что запросы приходят из вашего приложения

## ✅ Ограничение API-ключа (сделать ОБЯЗАТЕЛЬНО)

1. Открыть [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)
2. Выбрать проект `bunker-game-58b60`
3. Найти ключ, что совпадает с `VITE_FIREBASE_API_KEY` в `.env`
4. **Application restrictions** → «HTTP referrers (web sites)»
5. Добавить только свои домены:
   ```
   https://bunker-game-58b60.web.app/*
   https://bunker-game-58b60.firebaseapp.com/*
   https://ваш-домен.com/*
   http://localhost:5173/*            (для dev)
   http://localhost:4173/*            (для vite preview)
   ```
6. **API restrictions** → «Restrict key» → оставить только:
   - Cloud Firestore API
   - Identity Toolkit API (это Firebase Auth)
   - Token Service API
7. **Save**

После этого ключ бесполезен с чужого домена.

## 🛡 App Check (по желанию)

Дополнительный слой защиты: подключить reCAPTCHA v3 к Firebase App Check, чтобы
запросы шли только из настоящего браузера с вашим сайтом.
Инструкция: [firebase.google.com/docs/app-check/web/recaptcha-provider](https://firebase.google.com/docs/app-check/web/recaptcha-provider).

## 🚨 Что делать, если закоммитили секрет

Если вдруг `serviceAccount.json` попал в публичный репо:

1. **Сразу** в GCP Console → IAM → Service Accounts → найти ключ → **Delete key**
2. Сгенерировать новый → скачать в `scripts/serviceAccount.json`
3. Переписать историю git (только если репо приватный и вы одни):
   ```bash
   git filter-branch --force --index-filter \
     "git rm --cached --ignore-unmatch scripts/serviceAccount.json" \
     --prune-empty --tag-name-filter cat -- --all
   git push origin --force --all
   ```
   Лучший инструмент для очистки: [`git-filter-repo`](https://github.com/newren/git-filter-repo)
4. Принять, что ключ утёк и считать скомпрометированным любой аккаунт/данные, которые к нему относятся

## 📋 Чек-лист перед пушем в публичный GitHub

- [ ] `git status` — нет `.env`, `serviceAccount.json`, `*.key`, `.firebase/`
- [ ] `src/firebase.js` читает конфиг из `import.meta.env`, не хардкодит значения
- [ ] `.gitignore` содержит `.env`, `*serviceAccount*.json`, `.claude/`
- [ ] API-ключ ограничен по referrer в GCP Console
- [ ] Firestore Rules задеплоены: `firebase deploy --only firestore:rules`
- [ ] (Опционально) Подключён App Check

## 🔑 Как передавать .env другому разработчику

Не через GitHub. Варианты:
- Зашифрованный пароль-менеджер (1Password, Bitwarden)
- Telegram/Signal (не WhatsApp — там нет E2E по умолчанию для десктопа)
- Если команда — использовать [Doppler](https://www.doppler.com/) или [Vault](https://www.vaultproject.io/)
