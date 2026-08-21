# QWEN.md — контекст проекта MyCharacter

Рабочие правила и запреты — в `AGENTS.md`. Этот файл описывает **устройство
проекта и практику работы с ним**, чтобы не выяснять это заново каждую сессию.

## Что это

RU/EN веб-приложение для интерактивных PDF-листов персонажей НРИ. Всё
хранится локально: PDF, данные, сессии. Поверх листов персонажей построена
социальная часть — лента, посты (Editor.js), реакции, комментарии, подписки,
личные сообщения, каталог игровых систем с отзывами, модерация и админ-консоль.
Внешний облачный backend не нужен. AI опционален.

Версия монорепозитория: см. `version` в корневом `package.json` (все пакеты
держатся на одной версии).

## Карта репозитория

pnpm + TypeScript монорепозиторий (`pnpm-workspace.yaml`: `apps/*`, `packages/*`).

| Пакет | Путь | Роль |
| --- | --- | --- |
| `@mycharacter/web` | `apps/web` | Next.js 16, React 19, Tailwind, `next-intl` |
| `@mycharacter/api` | `apps/api` | Fastify: HTTP, авторизация, realtime, бизнес-логика |
| `@mycharacter/worker` | `apps/worker` | `pg-boss`: каталогизация PDF, AI vision |
| `@mycharacter/contracts` | `packages/contracts` | Zod-схемы и публичные типы — **источник истины** |
| `@mycharacter/database` | `packages/database` | Kysely, типы таблиц, миграции |
| `@mycharacter/pdf` | `packages/pdf` | разбор PDF и OCR |
| `@mycharacter/storage` | `packages/storage` | локальное и S3-совместимое хранилище |
| `@mycharacter/mcp` | `packages/mcp` | MCP-сервер к публичному API |

Инфраструктура: `compose.yaml` (dev/test), `compose.prod.yaml`, `Caddyfile*`,
`Dockerfile.web`, `Dockerfile.backend`, `scripts/`.

### Структура API

`apps/api/src/modules/<domain>/{routes,service}.ts`. Роуты — тонкий HTTP-адаптер,
логика в service. Регистрация всех модулей — в `apps/api/src/app.ts` (`buildApp`).
Ошибки — через `AppError` с машинным `code`; общий обработчик в `app.ts`.

### Структура web

Server Components по умолчанию. Серверные запросы — `src/lib/api/server.ts`,
клиентские — `src/lib/api/client.ts`. Тексты интерфейса — только через
`messages/ru.json` и `messages/en.json` (структура ключей обязана совпадать).

## Повседневные команды

Всё крутится в Docker; единственная внешняя точка входа — <http://localhost:8080>.

```bash
docker compose up -d --build          # первый запуск (нужен .env.local)
docker compose ps                     # состояние и health
docker compose logs --tail=250 api web worker proxy
docker compose stop                   # безопасная остановка
```

Никогда не запускать `docker compose down -v` — удалит базу и PDF.

После изменения зависимостей:

```bash
docker compose run --rm deps
```

После добавления миграции:

```bash
docker compose build migrate && docker compose run --rm migrate
```

Пересборка приложений:

```bash
docker compose build web api worker migrate
docker compose up -d --force-recreate api worker web proxy
```

## Проверки

Узкие, по одному пакету:

```bash
pnpm --filter @mycharacter/<pkg> lint
pnpm --filter @mycharacter/<pkg> typecheck
pnpm --filter @mycharacter/<pkg> test
```

Широкие:

```bash
pnpm -r lint
pnpm -r typecheck
```

Полная проверка (нужен PostgreSQL, поэтому в Docker; внутренние runtime-пакеты
собираются первыми):

```bash
docker compose --profile test build check
docker compose --profile test run --rm check sh -c \
  "pnpm --filter @mycharacter/database build && \
   pnpm --filter @mycharacter/storage build && \
   pnpm --filter @mycharacter/pdf build && \
   pnpm check"
```

E2E: `docker compose --profile test run --rm e2e`.

## Локальная отладка

Креды dev-базы: `postgresql://mycharacter:mycharacter@postgres:5432/mycharacter`.

```bash
docker compose exec -T postgres psql -U mycharacter -d mycharacter -c "\dt"
```

Первый администратор создаётся только служебным контейнером (пароль не попадает
в argv) — см. раздел «Первый администратор» в `README.md`.

## Грабли, на которые уже наступали

- **Fastify-логгер надо передавать явно.** `buildApp` по умолчанию создаёт
  приложение без логгера, чтобы тесты были тихими; `startServer` включает его
  (`LOG_LEVEL`, по умолчанию `info`). Если логгер выключен, `request.log.error`
  в обработчике ошибок уходит в никуда и любой 500 выглядит как «пусто в логах».
- **Ledger миграций легко испортить.** Тест `packages/database/test/dist-migrations.mjs`
  работает во временной схеме и **обязан** получать `migrationTableSchema`.
  Без него Kysely находит `public.kysely_migration` через `search_path`, пишет
  записи туда, а `create table` уходит во временную схему; после её удаления
  база считает миграции применёнными, а таблиц нет. `alter table` при этом
  попадает в `public`, поэтому колонки остаются — «половинчатое» состояние.
  Симптом: 500 на, казалось бы, рабочих эндпоинтах. Проверка:
  сравнить список из `kysely_migration` с фактическим `\dt`.
- **Миграция `202608190001_repair_social_tables`** восстанавливает пропавшие
  таблицы через `if not exists` и намеренно имеет пустой `down`: таблицы
  принадлежат миграциям `202608180004..0013`.
- **Сервис `migrate` не монтирует исходники** — исходный код зашит в образ.
  Новая миграция подхватится только после `docker compose build migrate`.
  У `api`/`web` наоборот, есть bind-mount, но `tsx watch` перечитывает не всё:
  при правках в `app.ts`/`server.ts` надёжнее `docker compose restart api`.
- **Контракт и ответ API не связаны типами.** Большинство роутов не объявляет
  response schema, поэтому TypeScript не заметит, если роут вернёт поле не с тем
  именем, что в `packages/contracts`. Такой дрейф падает уже в рантайме:
  Server Component читает `undefined` и страница отдаёт 500. Меняя форму
  ответа, править обе стороны.
- **JSON/JSONB для node-postgres сериализовать явно** (`JSON.stringify`), иначе
  массив уедет в PostgreSQL как array, а не jsonb.
- **Конфликт параметризованных маршрутов.** Публичные пути вынесены под
  отдельный префикс (`/api/public/posts/:username/:slug`), чтобы не спорить с
  `/api/posts/:id/...`.

## Ориентиры по документации

- `AGENTS.md` — обязательный рабочий контракт: Git-политика, запреты, объём проверок.
- `README.md` — конфигурация, production, бэкап/восстановление, лимиты PDF.
- `DESIGN.md` — визуальная система.
