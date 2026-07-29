import { expect, test } from "@playwright/test";
import {
  createCharacter,
  createUser,
  e2eBaseUrl,
} from "./helpers";

test("RU and EN landing pages are nonblank and free of browser errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Создать персонажа" }),
  ).toBeVisible();
  await expect(page.getByText("Умный каталог полей")).toBeVisible();
  await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);
  expect((await page.locator("body").innerText()).trim().length).toBeGreaterThan(
    200,
  );

  await page.getByRole("button", { name: "English" }).click();
  await expect(
    page.getByRole("link", { name: "Create a character" }),
  ).toBeVisible();
  await expect(page.getByText("Smart field catalog")).toBeVisible();
  await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("local API authentication survives sign-up, sign-out, and sign-in through the proxy", async ({ page }) => {
  const email = `hero-${Date.now()}@example.com`;
  const password = "correct horse battery staple";

  await page.goto("/auth/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/Пароль|Password/).fill(password);
  await page.getByRole("button", { name: /Продолжить|Continue/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: /Персонажи|Characters/ })).toBeVisible();

  await page.getByRole("button", { name: /Выйти|Sign out/ }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: /Войти|Sign in/ }).first()).toBeVisible();

  await page.goto("/auth/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/Пароль|Password/).fill(password);
  await page.getByRole("button", { name: /Продолжить|Continue/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto("/auth/reset-password");
  await expect(page.getByText(/восстановление пароля пока не подключено|password recovery is not available yet/i)).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
});

test("proxy forwards the local realtime WebSocket", async ({ page }) => {
  await page.goto("/");
  const message = await page.evaluate(
    () =>
      new Promise<unknown>((resolve, reject) => {
        const protocol = location.protocol === "https:" ? "wss:" : "ws:";
        const socket = new WebSocket(`${protocol}//${location.host}/api/realtime`);
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
    "/dashboard/new",
    "/dashboard/systems",
    "/dashboard/systems/new",
    `/characters/${character.id}`,
  ]) {
    await page.goto(`${e2eBaseUrl}${route}`);
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);
    expect(
      (await page.locator("body").innerText()).trim().length,
      `${route} rendered an empty page`,
    ).toBeGreaterThan(80);
  }

  await expect(page.getByTestId("copilot-chat-textarea")).toBeVisible();
  await page.getByRole("button", { name: /Поля|Fields/ }).click();
  await expect(
    page.getByPlaceholder(/Найти поле|Find a field/),
  ).toBeVisible();
  await expect(page.getByText("PDF", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);

  await Promise.all([context.close(), owner.api.dispose()]);
});
