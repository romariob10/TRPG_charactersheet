import { expect, test } from "@playwright/test";
import { createCharacter, createUser, e2eBaseUrl } from "./helpers";

test("the root path sends visitors to the product instead of a landing page", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("/");
  await expect(page).toHaveURL(/\/auth\/sign-in$/);
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);

  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(page.getByRole("button", { name: /Continue/ })).toBeVisible();
  await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("local API authentication survives sign-up, sign-out, and sign-in through the proxy", async ({
  page,
}) => {
  const email = `hero-${Date.now()}@example.com`;
  const password = "correct horse battery staple";

  await page.goto("/auth/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/Пароль|Password/).fill(password);
  await page.getByRole("button", { name: /Продолжить|Continue/ }).click();
  await expect(page).toHaveURL(/\/dashboard\/feed$/);

  const workspace = page.getByRole("complementary", {
    name: /Рабочая панель|Workspace/,
  });
  await expect(workspace).toBeVisible();

  // Sign-out now lives inside the sidebar account menu.
  await workspace.getByRole("button", { name: /Аккаунт|Account/ }).click();
  await page.getByRole("button", { name: /Выйти|Sign out/ }).click();
  await expect(page).toHaveURL(/\/auth\/sign-in$/);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/Пароль|Password/).fill(password);
  await page.getByRole("button", { name: /Продолжить|Continue/ }).click();
  await expect(page).toHaveURL(/\/dashboard\/feed$/);

  await page.goto("/auth/reset-password");
  await expect(
    page.getByText(
      /восстановление пароля пока не подключено|password recovery is not available yet/i,
    ),
  ).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
});

test("proxy forwards the local realtime WebSocket", async ({ page }) => {
  await page.goto("/auth/sign-in");
  const message = await page.evaluate(
    () =>
      new Promise<unknown>((resolve, reject) => {
        const protocol = location.protocol === "https:" ? "wss:" : "ws:";
        const socket = new WebSocket(
          `${protocol}//${location.host}/api/realtime`,
        );
        const timer = window.setTimeout(
          () => reject(new Error("Realtime WebSocket did not respond.")),
          3_000,
        );
        socket.addEventListener("message", (event) => {
          window.clearTimeout(timer);
          resolve(JSON.parse(String(event.data)));
          socket.close();
        });
        socket.addEventListener("error", () => {
          window.clearTimeout(timer);
          reject(new Error("Realtime WebSocket failed."));
        });
      }),
  );
  expect(message).toMatchObject({ type: "error", code: "AUTH_REQUIRED" });
});

test("authenticated product surfaces render through the public proxy", async ({
  browser,
}) => {
  const owner = await createUser("browser-acceptance");
  const character = await createCharacter(owner.api, "browser-surfaces");
  const context = await browser.newContext({
    storageState: await owner.api.storageState(),
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  for (const route of [
    "/dashboard",
    "/dashboard/feed",
    "/dashboard/new",
    "/dashboard/systems",
    "/dashboard/systems/new",
    "/dashboard/messages",
    "/dashboard/search",
  ]) {
    await page.goto(`${e2eBaseUrl}${route}`);
    await expect(page.locator("main")).toBeVisible();
    await expect(
      page.getByRole("navigation", {
        name: /Основная навигация|Primary navigation/,
      }),
    ).toBeVisible();
    await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);
    expect(
      (await page.locator("body").innerText()).trim().length,
      `${route} rendered an empty page`,
    ).toBeGreaterThan(80);
  }

  // The sheet editor keeps the workspace sidebar and fills the remaining area.
  await page.goto(`${e2eBaseUrl}/characters/${character.id}`);
  await expect(page.locator("main")).toBeVisible();
  const characterNavigation = page.getByRole("navigation", {
    name: /Основная навигация|Primary navigation/,
  });
  await expect(characterNavigation).toBeVisible();
  await page
    .getByRole("button", { name: /Свернуть панель|Collapse sidebar/ })
    .click();
  await expect(characterNavigation).toBeVisible();
  await page.getByTestId("sidebar-header").hover();
  await page
    .getByRole("button", { name: /Развернуть панель|Expand sidebar/ })
    .click();
  await expect(
    page.getByRole("button", { name: /Свернуть панель|Collapse sidebar/ }),
  ).toBeVisible();
  const adaptiveViewButton = page.getByRole("button", {
    name: /Удобный лист|Adaptive sheet/,
  });
  const pdfViewButton = page.getByRole("button", {
    name: /Оригинал PDF|Original PDF/,
  });
  const editorHeader = page.getByTestId("character-editor-header");
  await expect(adaptiveViewButton).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("heading", {
      name: /Все поля в удобном виде|Every field in a comfortable layout/,
    }),
  ).toBeVisible();
  await expect(page.locator("main").getByRole("textbox").first()).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("main")).toBeVisible();
  await expect(adaptiveViewButton).toBeVisible();
  await expect(pdfViewButton).toBeVisible();
  expect(
    await editorHeader.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await page.setViewportSize({ width: 1280, height: 900 });
  await pdfViewButton.click();
  await page.getByRole("button", { name: /Поля|Fields/ }).click();
  await expect(page.getByPlaceholder(/Найти поле|Find a field/)).toBeVisible();
  await expect(page.getByText("PDF", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);

  await Promise.all([context.close(), owner.api.dispose()]);
});
