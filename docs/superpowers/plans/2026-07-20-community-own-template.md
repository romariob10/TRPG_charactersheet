# Own Community Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Показывать владельцу его подтверждённый публичный шаблон в Explore Community с отметкой автора и переходом к разметке.

**Architecture:** Серверная страница перестаёт исключать `owner_id` текущего пользователя, выбирает владельца и передаёт вычисленный признак `owned` в существующую сетку. Клиентская карточка использует этот признак только для выбора действия: собственный шаблон открывается в редакторе, чужой сохраняет управление подпиской.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, next-intl, Supabase SSR, Vitest.

## Global Constraints

- Все команды проекта выполняются только внутри Docker.
- RLS, схема БД и запрет подписки пользователя на собственный шаблон не изменяются.
- В библиотеку входят только активные шаблоны `visibility = private`, `is_public = true`, со статусом `ready` или `partial` и заполненным `catalog_approved_at`.

---

### Task 1: Серверная выборка собственных публичных шаблонов

**Files:**
- Create: `src/app/dashboard/systems/community/page.test.tsx`
- Modify: `src/app/dashboard/systems/community/page.tsx`

**Interfaces:**
- Consumes: `requireUser(): {user, supabase}` и таблицу `pdf_templates`.
- Produces: `CommunityTemplateCard.owned: boolean` в данных `CommunityTemplateGrid`.

- [ ] **Step 1: Написать падающий серверный тест**

Тест возвращает шаблон текущего пользователя, перехватывает устаревший фильтр `neq` и проверяет данные сетки:

```tsx
expect(excludeOwner).not.toHaveBeenCalled();
expect(grid?.props.templates).toEqual([
  expect.objectContaining({ id: template.id, owned: true }),
]);
```

- [ ] **Step 2: Подтвердить падение**

```bash
docker compose exec -T app pnpm test -- src/app/dashboard/systems/community/page.test.tsx
```

Expected: FAIL, потому что страница вызывает `.neq("owner_id", user.id)` и не передаёт `owned`.

- [ ] **Step 3: Минимально изменить выборку**

```tsx
.select("id,title,game_system,page_count,updated_at,owner_id")
// удалить .neq("owner_id", user.id)

owned: template.owner_id === user.id,
```

- [ ] **Step 4: Подтвердить прохождение теста**

```bash
docker compose exec -T app pnpm test -- src/app/dashboard/systems/community/page.test.tsx
```

Expected: PASS.

---

### Task 2: Карточка собственного шаблона

**Files:**
- Create: `src/components/community-template-grid.test.tsx`
- Modify: `src/components/community-template-grid.tsx`
- Modify: `messages/ru.json`
- Modify: `messages/en.json`

**Interfaces:**
- Consumes: `CommunityTemplateCard.owned: boolean` из Task 1.
- Produces: собственная карточка с `ownTemplate` и `openMapping`, ведущая на `/dashboard/systems/${template.id}`.

- [ ] **Step 1: Написать падающие компонентные тесты**

```tsx
expect(ownedHtml).toContain("Ваш шаблон");
expect(ownedHtml).toContain("Открыть разметку");
expect(ownedHtml).toContain(`/dashboard/systems/${ownedTemplate.id}`);
expect(ownedHtml).not.toContain("Добавить к себе");

expect(foreignHtml).toContain("Добавить к себе");
expect(foreignHtml).not.toContain("Ваш шаблон");
```

- [ ] **Step 2: Подтвердить падение**

```bash
docker compose exec -T app pnpm test -- src/components/community-template-grid.test.tsx
```

Expected: FAIL, потому что карточка не различает владельца и подписчика.

- [ ] **Step 3: Добавить тип и условное действие**

```tsx
export interface CommunityTemplateCard {
  id: string;
  title: string;
  gameSystem: string | null;
  pageCount: number;
  updatedAt: string;
  subscribed: boolean;
  owned: boolean;
}
```

```tsx
{template.owned ? (
  <Link
    href={`/dashboard/systems/${template.id}`}
    className={cn(buttonClassName({ variant: "secondary" }), "w-full")}
  >
    {t("openMapping")}
  </Link>
) : (
  <Button
    className="w-full"
    variant={subscribed ? "secondary" : "primary"}
    disabled={pendingId === template.id}
    onClick={() => void toggle(template.id)}
  >
    {subscribed ? <Check className="size-4" /> : <Users className="size-4" />}
    {pendingId === template.id
      ? t("subscriptionPending")
      : subscribed
        ? t("removeFromMine")
        : t("addToMine")}
  </Button>
)}
```

На статусе карточки выводить `t("ownTemplate")` вместо `t("communityReady")`, когда `owned === true`.

- [ ] **Step 4: Добавить переводы**

```json
"ownTemplate": "Ваш шаблон",
"openMapping": "Открыть разметку"
```

```json
"ownTemplate": "Your template",
"openMapping": "Open mapping"
```

- [ ] **Step 5: Подтвердить прохождение обоих тестов**

```bash
docker compose exec -T app pnpm test -- src/app/dashboard/systems/community/page.test.tsx src/components/community-template-grid.test.tsx
```

Expected: PASS для собственного и чужого шаблона.

---

### Task 3: Полная проверка и Docker runtime

**Files:**
- Verify: `src/app/dashboard/systems/community/page.tsx`
- Verify: `src/components/community-template-grid.tsx`
- Verify: `messages/ru.json`
- Verify: `messages/en.json`

**Interfaces:**
- Consumes: завершённые Task 1 и Task 2.
- Produces: проверенный Docker runtime без новых ошибок.

- [ ] **Step 1: Отформатировать файлы**

```bash
docker compose exec -T app pnpm exec prettier --write src/app/dashboard/systems/community/page.tsx src/app/dashboard/systems/community/page.test.tsx src/components/community-template-grid.tsx src/components/community-template-grid.test.tsx messages/ru.json messages/en.json
```

- [ ] **Step 2: Выполнить обязательные проверки**

```bash
docker compose exec -T app pnpm lint
docker compose exec -T app pnpm typecheck
docker compose exec -T app pnpm test
docker compose --profile test run --rm -e NODE_ENV=production check pnpm build
```

Expected: все команды завершаются с кодом 0.

- [ ] **Step 3: Пересобрать приложение и проверить runtime**

```bash
docker compose up -d --build --force-recreate app
docker compose ps
docker compose logs --tail=250 app
```

Expected: контейнер `app` имеет статус `healthy`, в логах нет нового error overlay.

- [ ] **Step 4: Проверить авторизованный сценарий**

Открыть `/dashboard/systems/community` и подтвердить, что собственная система отображается с «Ваш шаблон» и «Открыть разметку», а консоль браузера не содержит новых ошибок.
