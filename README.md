# MyCharacter

MyCharacter — RU/EN веб-приложение для интерактивных PDF-листов персонажей
НРИ. Оно хранит PDF и данные полностью локально, поддерживает совместное
редактирование, каталогизацию полей, AI-предложения и экспорт PDF.

## Быстрый локальный запуск

Нужен только Docker Desktop.

```bash
cp .env.example .env.local
docker compose up -d --build
```

Откройте <http://localhost:8080>. При первом старте база обновляется
автоматически. AI необязателен: без ключа всё, кроме AI-помощника, продолжает
работать.

### QwenCloud Token Plan

Настройки в `.env.example` уже указывают на подписочный OpenAI-совместимый
Token Plan API QwenCloud и модель `qwen3.8-max-preview`. Не заменяйте адрес
Token Plan на обычный pay-as-you-go endpoint: подписочный ключ получит
`Access denied`. В `.env.local` вставьте отдельный ключ Token Plan с префиксом
`sk-sp-` со страницы
<https://home.qwencloud.com/billing/subscription/token-plan-individual> в строку:

```dotenv
AI_PRIMARY_API_KEY=ваш_ключ_qwencloud
```

`AI_PRIMARY_API_KEY` — основной актуальный ключ, а `AI_API_KEY` оставлен как
обратная совместимость со старыми конфигурациями. Если заполнены оба,
используется `AI_PRIMARY_API_KEY`. Не добавляйте `.env.local` в Git.

Администратор также может выбрать Qwen, OpenAI, OpenRouter или совместимый
провайдер и сохранить ключ на странице **Профиль → Админ-панель**. Эта
настройка имеет приоритет над `.env`, ключ не возвращается в браузер и
подхватывается API и worker без перезапуска.

После ручной смены ключа только в `.env` пересоздайте AI-сервисы:

```bash
docker compose up -d --force-recreate api worker
```

Безопасная остановка:

```bash
docker compose stop
```

Не запускайте `docker compose down -v`: флаг `-v` удаляет базу и PDF.

## Состав

- `web` — интерфейс Next.js;
- `api` — отдельный Fastify API;
- `worker` — каталогизация PDF и фоновые задания;
- `postgres` — локальная база;
- `proxy` — единственная внешняя точка входа Caddy;
- `pdf_data` и `postgres_data` — постоянные Docker volumes.

Внешний облачный backend не требуется.

## Социальная лента и S3

В ленте можно публиковать короткие записи и статьи через Editor.js: текст,
заголовки, списки, цитаты, разделители, изображения, а также встроенные
интерактивные карточки персонажей и игровых систем. Реакции и комментарии
обновляются без перезагрузки; длинные статьи открываются отдельной страницей.

Для S3-совместимого хранилища заполните `S3_BUCKET`, `S3_REGION`,
`S3_ACCESS_KEY_ID` и `S3_SECRET_ACCESS_KEY`. Для MinIO, Selectel и других
совместимых сервисов также задайте `S3_ENDPOINT`; при необходимости включите
`S3_FORCE_PATH_STYLE=true`. Если `S3_BUCKET` пуст, PDF и изображения постов
хранятся в локальном Docker volume, как раньше.

## Production на одном сервере

Скопируйте пример и замените пароль. Для публичного домена также укажите
домен и HTTPS-адреса по подсказкам внутри файла.

```bash
cp .env.prod.example .env.prod
docker compose --env-file .env.prod -f compose.prod.yaml build
docker compose --env-file .env.prod -f compose.prod.yaml up -d
docker compose --env-file .env.prod -f compose.prod.yaml ps
```

Снаружи открыты только Caddy-порты 80 и 443. База, API и worker доступны
только внутренней Docker-сети. TLS для настоящего домена Caddy получает
автоматически.

## Первый администратор

Пароль передаётся только служебному контейнеру, не печатается и не попадает
в строку команды.

Локально:

```bash
read -s ADMIN_PASSWORD
export ADMIN_PASSWORD
docker compose --profile tools run --rm \
  -e ADMIN_EMAIL=admin@example.com \
  -e ADMIN_PASSWORD \
  operations node scripts/create-admin.mjs
unset ADMIN_PASSWORD
```

В production добавьте к этой команде
`--env-file .env.prod -f compose.prod.yaml`.

## Обслуживание

Проверить состояние и логи:

```bash
docker compose ps
docker compose logs --tail=250 web api worker proxy postgres
```

Применить миграции вручную (обычно не требуется):

```bash
docker compose run --rm migrate
```

Проверить соответствие базы и PDF-хранилища:

```bash
docker compose --profile tools run --rm operations \
  node scripts/verify-storage.mjs
```

### Резервная копия

Для согласованной копии сначала остановите пользовательский трафик. База и
данные при этом не удаляются.

```bash
docker compose stop proxy web api worker
docker compose --profile tools run --rm operations sh scripts/backup.sh
docker compose start api worker web proxy
```

Архив появится в `backups/<дата-время>/`. Он содержит дамп PostgreSQL, PDF,
контрольные суммы и описание формата.

### Восстановление

Восстановление намеренно работает только в новой пустой базе и пустом
PDF-хранилище. Оно никогда не очищает существующие volumes. Скопируйте нужную
папку в `backups/`, запустите только пустую базу, затем:

```bash
BACKUP_NAME=20260729T120000Z
docker compose up -d postgres
docker compose --profile tools run --rm \
  -e BACKUP_PATH="/backups/$BACKUP_NAME" \
  operations sh scripts/restore.sh
docker compose up -d
```

Скрипт сначала проверяет контрольные суммы, затем восстанавливает данные и
повторно сверяет каждый PDF с базой.

### Смена секретов

- AI-ключ: измените `.env.local` или `.env.prod`, затем пересоздайте `api` и
  `worker`.
- Пароль базы: сначала сделайте backup и остановите трафик; смените пароль
  интерактивной командой `\password` внутри `psql`, обновите `.env.prod`, затем
  пересоздайте стек.
- Не добавляйте `.env.local`, `.env.prod`, пароли, ключи или дампы в Git.

## Проверки разработки

Все проверки запускаются только в Docker:

```bash
docker compose --profile test run --rm check
docker compose --profile test run --rm -e NODE_ENV=production check pnpm build
docker compose --profile test run --rm e2e
```

Production-конфигурацию можно проверить без запуска:

```bash
docker compose --env-file .env.prod -f compose.prod.yaml config --quiet
```

## Ограничения PDF

Поддерживаются AcroForm PDF до 25 МБ и 20 страниц. Зашифрованные документы,
XFA-only PDF и файлы без AcroForm отклоняются. Репозиторий не содержит
сторонних игровых PDF из-за лицензионных ограничений.

### AI-агенты через MCP

В профиле (`/dashboard/profile`) откройте «AI-агенты · MCP», укажите имя агента
и создайте токен. Полный токен показывается только при создании; в базе хранится
SHA-256-хеш. Срок токена из интерфейса — 90 дней. Отзыв в профиле немедленно
блокирует новые запросы и убирает курсор. Используйте отдельный токен для каждого
агента. Токен даёт обычные пользовательские права владельца на данные;
управление токенами, авторизацией и администрированием требует браузерной сессии.

Сервер использует stdio и запускается на компьютере AI-клиента (Node.js 22+).
Сначала соберите локальные пакеты:

```bash
pnpm --filter @mycharacter/contracts build
pnpm --filter @mycharacter/mcp build
```

Пример конфигурации MCP-клиента (замените путь, адрес и плейсхолдер токена):

```json
{
  "mcpServers": {
    "mycharacter": {
      "command": "node",
      "args": ["/absolute/path/TRPG_charactersheet/packages/mcp/bin/mycharacter-mcp.js"],
      "env": {
        "MYCHARACTER_API_URL": "http://localhost:8080",
        "MYCHARACTER_TOKEN": "<TOKEN_FROM_PROFILE>"
      }
    }
  }
}
```

Для удалённой установки используйте её HTTPS-адрес. Не коммитьте конфигурацию
с настоящим токеном. MCP не вызывает модель на стороне MyCharacter: модель и
оплата остаются у подключённого AI-клиента. Старый встроенный чат остаётся доступен.

Основной сценарий агента:

1. `mycharacter_create_game_system` возвращает `defaultSheetId`.
2. `mycharacter_get_sheet_editor` возвращает полное дерево и текущую ревизию.
3. `mycharacter_set_presence` с `resourceType: "sheet"`, `resourceId`, `target`,
   `x`, `y`, `status` показывает агента в редакторе. Координаты — доли холста
   от 0 до 1, независимо от масштаба. Сервер поддерживает присутствие каждые
   10 секунд; без heartbeat оно исчезает через 30 секунд.
4. `mycharacter_save_sheet_draft` принимает `id` и `input` с `expectedRevision`,
   всеми четырьмя `layouts` и `fields`. Точные схемы выдаёт MCP `tools/list`.
   При конфликте нужно перечитать лист и объединить изменения.
5. `mycharacter_publish_sheet` создаёт неизменяемую версию;
   `mycharacter_create_character` принимает её `sheetVersionId`.
6. `mycharacter_get_sheet_field_values` возвращает значения и версии полей.
   `mycharacter_update_sheet_field` принимает `id`, `key`, `input` с `value`,
   `expectedVersion` и уникальным UUID `clientMutationId`.
7. `mycharacter_leave_editor` убирает присутствие после работы.

Поддерживаются также создание и публикация компонентов, клонирование, корзина
и восстановление персонажей, существующие инструменты PDF-полей и публикаций.
Изменения шаблона подтягиваются в открытый редактор, когда нет несохранённых
локальных правок; поля персонажа обновляются с учётом их версий. Имя и статус
агента видны отдельно от людей. Это присутствие в редакторе, а не новый контакт
в личных сообщениях. Внешний HTTP MCP endpoint и OAuth пока не предоставляются.
