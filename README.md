# MyCharacter

Веб-приложение для хранения, совместного редактирования и AI-заполнения интерактивных листов персонажей НРИ.

## Возможности MVP

- регистрация и вход по email/password через Supabase Auth;
- создание персонажа из курируемого шаблона или собственного AcroForm PDF;
- редактирование text, multiline, checkbox, radio, dropdown и list-полей поверх PDF;
- автосохранение, realtime-синхронизация, presence и уведомления о параллельной записи;
- автоматический каталог подписей, разделов и пространственных групп через PDF text layer, OCR и vision fallback;
- ручные исправления каталога, изолированные на уровне персонажа;
- интерактивный и flattened-экспорт с поддержкой кириллицы;
- одноразовые ссылки для редакторов, клонирование и 30-дневная корзина;
- персональный сохраняемый CopilotKit-чат с обязательным preview изменений.

## Стек

- Next.js App Router, React, TypeScript, Tailwind CSS и `next-intl`;
- Supabase PostgreSQL/Auth/Storage/Realtime с Row Level Security;
- PDF.js, pdf-lib, fontkit и Tesseract.js;
- Inngest для каталога и очистки корзины;
- CopilotKit v2 и AI SDK OpenAI-compatible provider.

## Docker-only запуск

На хосте требуется только Docker с Compose. Node.js, pnpm, Chromium и Inngest устанавливать локально не нужно — установка зависимостей, разработка, сборка и тесты выполняются внутри контейнеров.

```bash
cp .env.example .env.local
```

Заполните `.env.local`. Для миграций создайте отдельный файл, чтобы Postgres URI не передавался app-контейнеру:

```bash
cp .env.migrate.example .env.migrate.local
```

В Supabase нажмите **Connect**, скопируйте Direct connection или Session pooler URI, URL-кодируйте пароль и сохраните строку в `SUPABASE_DB_URL` внутри `.env.migrate.local`. Затем примените миграции отдельным контейнером:

```bash
docker compose --profile tools run --rm migrate
```

Контейнер последовательно применяет файлы из `supabase/migrations`, хранит версии в закрытой служебной схеме и обновляет PostgREST schema cache. Миграция создаёт приватный bucket `character-pdfs`, таблицы, RPC, RLS и realtime publication; локальная установка Supabase CLI или PostgreSQL не требуется.

В Supabase откройте **Settings → API Keys → Publishable and secret API keys**. Значение `sb_publishable_…` укажите в `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, а серверное `sb_secret_…` — в `SUPABASE_SECRET_KEY`. Legacy `anon` и `service_role` ключи приложение намеренно отклоняет.

Запустите development stack:

```bash
docker compose up --build
```

Приложение откроется на [http://localhost:3000](http://localhost:3000), локальная панель Inngest — на [http://localhost:8288](http://localhost:8288). Compose передаёт приложению `INNGEST_DEV=http://inngest:8288`, поэтому локальные event/signing keys не нужны. Исходники подключены как bind mount, а `node_modules` и `.next` хранятся в Docker volumes; hot reload работает внутри контейнера.

Если стандартные порты заняты, их можно переопределить без изменения Compose-файла:

```bash
APP_PORT=3010 INNGEST_PORT=8388 INNGEST_CONNECT_PORT=8389 docker compose up --build
```

Остановить stack:

```bash
docker compose down
```

Для полной очистки контейнерных зависимостей и кэша:

```bash
docker compose down -v
```

## AI-провайдер

Серверная конфигурация принимает совместимый с OpenAI Chat Completions endpoint:

```dotenv
AI_BASE_URL=https://provider.example/v1
AI_API_KEY=...
AI_CHAT_MODEL=model-with-streaming-and-tools
AI_VISION_MODEL=model-with-image-input
```

`AI_VISION_MODEL` можно не задавать: тогда используется chat-модель. Для ассистента необходимы streaming и tool calls, для vision-каталога — image input. Модель не имеет инструмента прямой записи: она может только вызвать `searchFields`, `getFieldContext` и `proposeFieldChanges`. Подтверждённое предложение применяет отдельная PostgreSQL-транзакция с проверкой версий и прав.

## PDF-каталог

Обработка проходит в Inngest:

1. PDF.js извлекает widgets, текст и нормализованные координаты.
2. Геометрический matcher сопоставляет ближайшие подписи и заголовки.
3. На слабых страницах Tesseract распознаёт русский и английский текст.
4. При согласии пользователя vision-модель получает страницу без значений widgets и с рамками идентификаторов полей.
5. Результат валидируется Zod-схемой и сохраняется; сбой vision даёт статус `partial`, не уничтожая детерминированный каталог.

Поддерживаются PDF до 25 МБ и 20 страниц. Зашифрованные файлы, XFA-only документы и PDF без AcroForm отклоняются.

## Курируемые шаблоны

Шаблоны не включены в репозиторий из-за лицензионных ограничений. Администратор может загрузить разрешённый PDF:

```bash
docker compose exec app pnpm template:import ./sheet.pdf "Название шаблона" "Игровая система"
```

Файл должен находиться внутри репозитория, который подключён в `/app`. Команда использует новый Supabase secret key, помещает PDF в приватный bucket и запускает тот же каталогизатор.

## Проверки

```bash
docker compose --profile test build check e2e
docker compose --profile test run --rm check
docker compose --profile test run --rm e2e
```

`check` запускает ESLint, TypeScript и Vitest. `e2e` использует отдельный официальный Playwright-образ с Chromium; браузер также не устанавливается на хост. Unit-тесты включают реальное создание и извлечение AcroForm PDF.

Production-образ собирается отдельным target и содержит только Next.js standalone runtime:

```bash
docker compose --env-file .env.local -f compose.prod.yaml build
docker compose --env-file .env.local -f compose.prod.yaml up -d
```

Публичные Supabase-переменные передаются как build arguments, поскольку Next.js встраивает их в клиентский bundle. `SUPABASE_SECRET_KEY`, AI-ключ и Inngest-ключи остаются только runtime-переменными и не попадают в слои образа.

## Развёртывание

1. Создайте Supabase project и примените миграцию.
2. Соберите `runner` target из `Dockerfile` и передайте публичные Supabase build arguments.
3. Создайте Inngest app, добавьте event/signing keys и синхронизируйте `/api/inngest`.
4. В Supabase Auth укажите production Site URL и callback `/auth/callback`.
5. Передайте контейнеру runtime-переменные из `.env.example` и проверьте `/api/health`.

Supabase secret key и AI-ключ используются только в server routes/background functions и никогда не отправляются в браузер. Клиент и SSR используют publishable key.
