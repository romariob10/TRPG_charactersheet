# Развёртывание rodev.cc

GitHub Actions CI проверяет lint, TypeScript, сборку production-приложений,
unit/integration и браузерные тесты. `Deploy production` принимает только текущий
коммит main с последним успешным CI push run. PR никогда не запускается на
production runner. Ручной запуск также требует успешного CI текущего main.

После проверки Actions собирает образы GHCR с неизменяемым тегом `sha-<commit>`.
Runner rodev делает резервную копию базы и файлов, затем выполняет
`scripts/deploy-production.sh`: блокировка параллельных запусков, проверка чистоты
checkout и актуальности main, pull готовых образов и `up --no-build --wait`.
Сборка на production не требуется. Состояние успешно развёрнутого SHA хранится
в `.git/mycharacter-deployed-sha` и не загрязняет checkout. Tagged images
сохраняются для отката; cleanup не трогает volumes.

Старый `mycharacter-deploy.timer`, который собирал любой main без CI, отключён.
Действующий путь развёртывания — GitHub Actions и production self-hosted runner.
Не включайте старый таймер одновременно с Actions.

На сервере установлены units из `deploy/systemd`:

- `mycharacter-backup.timer`: каждый день около 04:30 по времени сервера,
  резервные копии в `/home/user/backups/mycharacter`, доступ 0700/0600,
  проверка чтения pg_dump и SHA256; хранение 14 дней;
- `mycharacter-docker-maintenance.timer`: по воскресеньям около 05:30,
  только старый неиспользуемый build cache и dangling images старше 7 дней.

Скрипт резервирования: `/usr/local/sbin/mycharacter-backup-production`, источник
`scripts/backup-production.sh`. Пароль БД используется внутри контейнера и не
выводится. Storage tar и PostgreSQL dump создаются последовательно: для строгой
согласованности восстановления при активных загрузках нужна пауза записи.
Копии на этом же сервере помогают откату, но не защищают от потери диска;
для этого нужны внешние копии.

Проверка состояния:

```sh
ssh rodev 'df -h /; docker ps; systemctl list-timers --all "mycharacter-*"'
```

Откат выполняется отдельно после проверки совместимости миграций: выберите
сохранённый SHA, выставьте `MYCHARACTER_IMAGE_TAG=sha-<SHA>` и запустите production
Compose с этим тегом. Не откатывайте схему БД автоматически и не удаляйте volumes.
