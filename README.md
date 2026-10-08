# ⏰ Telegram Reminder Bot (Cloudflare Workers + D1 + Cron)

Автономный Telegram-бот персональных напоминаний с поддержкой текстовых и голосовых сообщений.
Работает 24/7 в serverless-инфраструктуре Cloudflare без VPS, без Docker и без постоянно включенного компьютера.

## ✨ Ключевые возможности

- 📝 **Распознавание текста и естественного времени**:
  - `Напомни мне через час позвонить клиенту`
  - `Завтра в 10 утра забрать документы`
  - `В пятницу в 18:00 позвонить маме`
  - `Через 3 дня проверить отчёт`
  - `Купить молоко` *(если время не указано, автоматически ставит через 30 минут)*
- 🎙️ **Голосовые сообщения**: встроенный Speech-to-Text через **Cloudflare Workers AI (Whisper)** без сторонних платных сервисов.
- ⏰ **Повторы каждые 15 минут**: если пользователь не нажал кнопку, напоминание повторяется каждые 15 минут до явного действия.
- 💤 **Откладывание напоминания (Snooze)**:
  - 2 часа
  - 4 часа
  - Завтра 09:00 (с учетом часового пояса `Asia/Almaty`)
  - 3 дня
  - Неделя
- 🛡️ **Идемпотентность и защита от дублей**: атомарный механизм захвата напоминаний (`claim_token`) исключает повторную отправку при параллельных запусках Cron.
- 🔒 **Безопасность**: все токены хранятся исключительно в Cloudflare Secrets. В коде и репозитории нет секретов.
- 🎯 **Независимость задач**: каждое напоминание хранится и обрабатывается как отдельная строка в Cloudflare D1.

---

## 🏗 Архитектура

```
                      TELEGRAM
                         │
               ┌─────────┴─────────┐
               │                   │
            TEXT                VOICE
               │                   │
               │            Cloudflare AI
               │             (Whisper)
               │                   │
               └─────────┬─────────┘
                         ↓
                  Reminder Parser
                         ↓
                  Reminder Service
                         ↓
                  Cloudflare D1
                         ↓
                ┌────────┴────────┐
                │                 │
            remind_at          next_repeat_at
                │                 │
                └────────┬────────┘
                         ↓
                  Cloudflare Cron (* * * * *)
                         ↓
                  Reminder Worker
                         ↓
                  Telegram Bot API
                         ↓
                ┌────────┴─────────┐
                ↓                  ↓
          [Выполнено]        [Отложить]
                │                  │
                ↓                  ↓
            completed        2h / 4h /
                             tomorrow /
                             3d / 7d
```

---

## 🗄 Структура проекта

```
telegram-reminder-bot/
├── .env.example                # Шаблон переменных окружения (без секретов)
├── .gitignore                  # Исключение секретов, .env и артефактов
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── wrangler.toml               # Конфигурация Cloudflare Worker, D1 и Cron
├── migrations/
│   └── 0001_initial_schema.sql # Схема базы данных D1
├── src/
│   ├── index.ts                # Обработчики HTTP (Webhook) и Scheduled (Cron)
│   ├── types.ts                # TypeScript интерфейсы
│   ├── config.ts               # Настройки, whitelist и таймзона
│   ├── db/
│   │   ├── schema.sql
│   │   └── remindersRepository.ts # Работа с D1, атомарный claim_token
│   ├── reminders/
│   │   ├── reminderParser.ts   # Парсер русского естественного языка
│   │   ├── reminderScheduler.ts# Движок обработки Cron и повторов
│   │   └── reminderService.ts  # Бизнес-логика создания, откладывания
│   ├── telegram/
│   │   ├── bot.ts              # Роутинг сообщений и команд бота
│   │   ├── client.ts           # Telegram Bot API клиент
│   │   ├── keyboards.ts        # Inline клавиатуры (Выполнено / Отложить)
│   │   └── callbacks.ts        # Обработка нажатий на кнопки
│   ├── voice/
│   │   └── transcription.ts    # STT сервис (Workers AI Whisper)
│   └── utils/
│       ├── dates.ts            # Расчеты и форматирование даты (Asia/Almaty)
│       ├── timezone.ts
│       └── logger.ts           # Безопасное логирование без утечки секретов
└── test/
    ├── reminderParser.test.ts  # Тесты парсера дат
    ├── reminderScheduler.test.ts # Тесты шедулера и повторов
    └── concurrency.test.ts     # Тесты параллелизма и отсутствия дублей
```

---

## 🚀 Пошаговое руководство по развертыванию

### Шаг 1. Клонирование репозитория
```bash
git clone https://github.com/tapwork-kz/telegram-reminder-bot.git
cd telegram-reminder-bot
```

### Шаг 2. Установка зависимостей
```bash
npm install
```

### Шаг 3. Авторизация в Cloudflare
```bash
npx wrangler login
```

### Шаг 4. Создание базы данных Cloudflare D1
```bash
npx wrangler d1 create telegram-reminder-db
```
Скопируйте полученный `database_id` в `wrangler.toml`:
```toml
[[d1_databases]]
binding = "DB"
database_name = "telegram-reminder-db"
database_id = "<ВАШ_DATABASE_ID>"
```

### Шаг 5. Применение миграций схемы
```bash
npm run d1:migrate:remote
```

### Шаг 6. Настройка секретов Cloudflare (Secrets)
Секреты задаются через CLI и никогда не сохраняются в коде:
```bash
# Токен бота из @BotFather
npx wrangler secret put TELEGRAM_BOT_TOKEN

# Секретный токен для вебхука (любая случайная строка)
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET

# ID разрешенных пользователей Telegram (через запятую, либо * для всех)
npx wrangler secret put ALLOWED_TELEGRAM_USER_ID
```

### Шаг 7. Деплой Worker в Cloudflare
```bash
npm run deploy
```

После выполнения деплоя консоль выведет URL вашего Worker, например:
`https://telegram-reminder-bot.<subdomain>.workers.dev`

### Шаг 8. Настройка Telegram Webhook
Выполните POST запрос к эндпоинту Worker:
```bash
curl -X POST https://telegram-reminder-bot.<subdomain>.workers.dev/telegram/setup-webhook
```
Либо напрямую через Telegram API:
```bash
curl -F "url=https://telegram-reminder-bot.<subdomain>.workers.dev/telegram/webhook" \
     https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook
```

### Шаг 9. Проверка Cron Trigger
Cron запускается автоматически каждую минуту (`* * * * *`).
Проверить логи можно в реальном времени командой:
```bash
npx wrangler tail
```

### Шаг 10. Проверка работы бота
1. Откройте бота в Telegram и отправьте `/start`.
2. Напишите: `Напомни через час позвонить клиенту`.
3. Отправьте голосовое сообщение с задачей.
4. Дождитесь уведомления и проверьте кнопки: `✅ Выполнено`, `⏰ Отложить`, `❌ Неактуально`.

---

## 🧪 Запуск автоматических тестов

Для проверки парсера дат, повторов и параллельной обработки выполните:
```bash
npm run test
```

Для проверки типов TypeScript:
```bash
npm run typecheck
```
