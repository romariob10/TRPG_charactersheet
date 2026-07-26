# MyCharacter — инструкции для агентов

## Цель проекта

MyCharacter — RU/EN веб-приложение для хранения, совместного редактирования и AI-заполнения интерактивных AcroForm PDF-листов персонажей НРИ.

Основной сценарий: пользователь входит по email/password, создаёт персонажа, загружает PDF, редактирует поля поверх PDF.js, получает автосохранение и Realtime, использует AI через безопасный preview предложений и скачивает интерактивный либо flattened PDF.

## Главное правило: только Docker

Пользователь запускает проект строго через Docker. Не запускайте на хосте `node`, `pnpm`, `npm`, `npx`, Next.js, Vitest, Playwright, миграции или вспомогательные project scripts.

Допустимые шаблоны:

```bash
docker compose up --build
docker compose exec -T app pnpm lint
docker compose exec -T app pnpm typecheck
docker compose exec -T app pnpm test
docker compose --profile test run --rm check
docker compose --profile test run --rm -e NODE_ENV=production check pnpm build
docker compose --profile tools run --rm migrate
docker compose --env-file .env.local -f compose.prod.yaml build
docker compose --env-file .env.local -f compose.prod.yaml up -d
```

При чтении файлов тоже предпочтительно использовать уже запущенный `app`-контейнер. Файлы изменять через `apply_patch`. Не удалять Docker volumes и не выполнять destructive Git-команды без явного запроса.

## Стек и архитектура

- Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, `next-intl`.
- Supabase Auth, PostgreSQL, RLS, приватный Storage и Realtime.
- Inngest для долговечных заданий каталога и purge.
- PDF.js для рендера/координат, `pdf-lib` + `fontkit` для экспорта.
- Tesseract RU+EN и vision fallback для каталога.
- CopilotKit v2, AG-UI и AI SDK OpenAI-compatible provider.
- RU и EN сообщения находятся в `messages/ru.json` и `messages/en.json`.

Основные каталоги:

- `src/app` — App Router страницы и Route Handlers.
- `src/components/editor` — PDF-редактор, поля, каталог и AI-sidebar.
- `src/lib/pdf` — извлечение, каталогизация, координаты и экспорт.
- `src/lib/ai` — provider, runner, вложения, история и инструменты.
- `src/lib/supabase` — browser/server/admin clients и auth helpers.
- `src/inngest` — фоновые функции.
- `supabase/migrations` — схема, RPC, RLS и Realtime publication.
- `scripts` — Docker-миграции и административный импорт шаблонов.

## Конфигурация и секреты

Используются современные Supabase-ключи:

- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...`
- `SUPABASE_SECRET_KEY=sb_secret_...`

Legacy `anon` и `service_role` ключи намеренно не использовать. Секретный ключ, AI API key и DB URI никогда не передавать в браузер, не печатать в логах/ответах и не коммитить.

AI-конфигурация:

```dotenv
AI_BASE_URL=https://api.deepseek.com
AI_API_KEY=...
AI_CHAT_MODEL=deepseek-v4-pro
AI_VISION_MODEL=deepseek-v4-pro
```

Фактические значения всегда брать из `.env.local`, не вшивать в код или документацию. Модель должна поддерживать streaming и tool calls; vision-модель — изображения. Capability endpoint: `/api/ai/capabilities`.

В локальном Compose `INNGEST_DEV=http://inngest:8288`, поэтому `INNGEST_EVENT_KEY` и `INNGEST_SIGNING_KEY` могут быть пустыми. В production эти ключи выдаёт Inngest Cloud.

## Supabase и данные

Перед изменением БД изучить существующие миграции. Уже применённые миграции не переписывать для production-фиксов — добавлять новый timestamped migration. DDL применять миграцией; read-only диагностику и осознанные data repairs можно выполнять через подключённый Supabase-инструмент.

Критические правила:

- RLS должна ограничивать владельца/редакторов и персональные AI-диалоги.
- Исходные PDF лежат только в приватном bucket `character-pdfs`.
- Signed URL выдаётся сервером после проверки членства.
- Межпользовательской дедупликации приватных PDF нет.
- `character_values` хранит значение отдельно от PDF и имеет `version`.
- `characters.revision` увеличивается при подтверждённых изменениях.
- `character_values`, `characters` и `catalog_jobs` включены в `supabase_realtime` publication.
- Service/secret key допустим только в server-only admin client.

После DDL проверить RLS и Supabase security/performance advisors. Не ослаблять политики ради исправления клиентского бага.

## PDF-редактор

- Рендер PDF.js выполняется без встроенных form widgets; React-контролы накладываются по сохранённым нормализованным координатам.
- Поддерживаются text, multiline, checkbox, radio, dropdown и list. Button/signature/unknown не редактируются.
- Multiline должен рендериться как `textarea`, а не однострочный input.
- Учитывать crop box, page rotation, repeated widgets и масштаб.
- Автосохранение: debounce 500 мс и немедленно на blur.
- Перед экспортом flush очереди сохранения.
- Экспорт поддерживает интерактивный и flattened режимы и Noto Sans для кириллицы.
- Лимиты импорта: 25 МБ, 20 страниц, `%PDF-` magic bytes, AcroForm обязателен; encrypted/XFA-only отклоняются.

Панель каталога полей по умолчанию закрыта. Редактор рассчитан на desktop и планшеты.

## Каталогизация

Pipeline находится в `src/inngest/catalog.ts` и `src/lib/pdf`:

1. Извлечь поля, widgets, значения, типы/options, страницы и координаты.
2. Извлечь text layer с bounding boxes.
3. Выполнить детерминированный label scoring и grouping.
4. Для слабого text layer применить Tesseract RU+EN.
5. При согласии пользователя и низкой уверенности использовать vision.
6. Валидировать AI-ответ Zod-схемой; сбой vision должен оставить `partial`, а не уничтожить импорт.
7. Manual overrides имеют источник `manual` и не перезаписываются повторным анализом.

Не добавлять сторонние D&D/Pathfinder PDF в репозиторий без разрешения правообладателя.

## AI-ассистент: обязательные инварианты

У агента только три server tools:

- `searchFields(query, section?, page?, nearFieldId?)`
- `getFieldContext(fieldIds | groupId)`
- `proposeFieldChanges(changes[])`

AI не записывает значения напрямую. `proposeFieldChanges` создаёт персональное предложение; запись происходит только после пользовательского подтверждения через `POST /api/characters/[id]/field-batches` и PostgreSQL RPC с повторной проверкой прав, типов/options и версий.

Важные детали текущей реализации:

- При открытии редактора создаётся новый thread; старые чаты доступны через историю.
- Диалоги персональны для пары пользователь–персонаж.
- `src/lib/ai/supabase-runner.ts` хранит/восстанавливает AG-UI messages.
- Поток `connect()` обязан начинаться `RUN_STARTED`, затем отдавать `MESSAGES_SNAPSHOT` и завершаться `RUN_FINISHED`; у начала и конца один `runId`. Иначе CopilotKit выдаёт `First event must be 'RUN_STARTED'`.
- Перед provider call вложения нормализуются в поддерживаемые text/image parts. Не передавать provider-у сырой variant `file`/binary data URL.
- История ремонтирует пары assistant tool call → tool result. Нельзя оставлять orphan/missing tool results.
- Темы чатов строятся по первому содержательному user request, игнорируют короткие приветствия и сериализованный `<attachment ...>`.
- Карточка предложения может показать `Применено` только если число `applied` совпало с числом выбранных строк и нет конфликтов.
- Batch endpoint возвращает актуальные `value`, `version`, `revision`, `updatedBy` для применённых строк.
- `CharacterEditor` применяет этот snapshot локально сразу. Не полагаться только на Realtime для отображения собственных AI-изменений.
- При неоднозначном поиске или низкой уверенности AI должен запросить уточнение.

Связанные файлы:

- `src/components/editor/ai-assistant.tsx`
- `src/components/editor/character-editor.tsx`
- `src/app/api/copilotkit/route.ts`
- `src/app/api/characters/[id]/field-batches/route.ts`
- `src/lib/ai/supabase-runner.ts`
- `src/lib/ai/history.ts`
- `src/lib/ai/attachments.ts`

## Auth и маршруты

- `/` должен корректно учитывать серверную Supabase-сессию и не показывать авторизованного пользователя как гостя.
- Dashboard: `/dashboard`; создание: `/dashboard/new`; редактор: `/characters/[id]`.
- Email confirmation, callback и password recovery не ломать.
- Upload собственного PDF остаётся доступен при создании персонажа.
- Route Handler inputs валидировать Zod-схемами и никогда не доверять `characterId/templateId/userId` из клиента без повторной DB-проверки.

## Проверки перед завершением задачи

Минимум для code change:

```bash
docker compose exec -T app pnpm lint
docker compose exec -T app pnpm typecheck
docker compose exec -T app pnpm test
```

Для изменений runtime/UI/API дополнительно:

```bash
docker compose --profile test run --rm -e NODE_ENV=production check pnpm build
docker compose ps
docker compose logs --tail=250 app
```

Если dev-контейнер запускался или перезапускался, проверить приложение в браузере: страница не пустая, отсутствует Next error overlay, нет новых console errors, ключевые элементы доступны. Авторизованные сценарии сверять также по server logs и данным Supabase; не считать один HTTP 200 доказательством корректного UI-state.

Полный E2E запускается только внутри Playwright-контейнера:

```bash
docker compose --profile test run --rm e2e
```

Известные нефатальные dev-предупреждения: PDF.js может сообщать об отсутствующих проприетарных системных шрифтах исходного PDF, а Lit — о development mode. Не путать их с ошибками приложения.

## Текущий baseline

На момент создания файла:

- Docker development stack работает через `app` + `inngest`.
- ESLint и TypeScript проходят.
- Vitest: 5 файлов, 16 тестов проходят.
- Production Next.js build проходит в Docker при `NODE_ENV=production`.
- Исправлены AG-UI connect lifecycle, tool-result history, файловые вложения, новый чат + история, темы чатов и мгновенное отображение применённых AI-предложений.

Baseline — ориентир, а не замена повторной проверке после изменений.
