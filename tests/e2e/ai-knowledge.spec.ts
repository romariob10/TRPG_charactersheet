import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { Client } from "pg";
import {
  createCharacter,
  createUser,
  e2eBaseUrl,
  e2eDatabaseUrl,
  expectStatus,
  fieldByName,
  saveField,
} from "./helpers";

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`rules answers cite retrieved sources without changing the sheet (${viewport.name})`, async ({
    browser,
  }) => {
    const owner = await createUser(`rag-${viewport.name}`);
    const character = await createCharacter(owner.api, `rag-${viewport.name}`);
    await saveField(
      owner.api,
      character.id,
      fieldByName(character, "acceptance.name").id,
      "Keep this character name",
    );
    const before = await readFieldValues(owner.api, character.id);
    const database = new Client({ connectionString: e2eDatabaseUrl });
    await database.connect();
    const context = await browser.newContext({
      storageState: await owner.api.storageState(),
      viewport: { width: viewport.width, height: viewport.height },
    });
    try {
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });

      await page.goto(`${e2eBaseUrl}/characters/${character.id}`);
      const answer = await askRulesQuestion(
        page,
        "Как работает преимущество в D&D 5e 2014?",
      );
      expect(answer).toContain("searchRpgKnowledge");
      expect(answer).toContain("5e-2014");
      expect(answer).not.toContain("proposeFieldChanges");
      await expect(page.getByText(/выбор большего из двух d20/)).toBeVisible();
      const source = page.getByRole("link", {
        name: "D&D Basic Rules (2014): Advantage and Disadvantage",
        exact: true,
      });
      await expect(source).toHaveAttribute(
        "href",
        "https://www.dndbeyond.com/sources/dnd/basic-rules-2014/using-ability-scores",
      );
      await source.scrollIntoViewIfNeeded();
      await expect(source).toBeInViewport();

      // Reuse the chat to ensure an earlier retrieval cannot answer an unrelated question.
      const missing = await askRulesQuestion(
        page,
        "Как работает квантовая магия гравихомяков в D&D 5e 2014?",
      );
      expect(missing).toContain("searchRpgKnowledge");
      expect(missing).not.toContain("proposeFieldChanges");
      await expect(
        page.getByText(/В базе знаний нет подходящего источника для этого вопроса/),
      ).toBeVisible();
      await expect(source).toHaveCount(1);
      await expect(page.getByText(/Предлагаемые изменения|Proposed changes/)).toHaveCount(0);
      expect(await readFieldValues(owner.api, character.id)).toEqual(before);
      const proposals = await database.query<{ id: string }>(
        "select id from ai_proposals where character_id = $1 and user_id = $2",
        [character.id, owner.id],
      );
      expect(proposals.rows).toEqual([]);
      await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);
      const chatBox = await page.getByTestId("copilot-chat-textarea").boundingBox();
      expect(chatBox).not.toBeNull();
      expect(chatBox!.x).toBeGreaterThanOrEqual(0);
      expect(chatBox!.x + chatBox!.width).toBeLessThanOrEqual(viewport.width);
      expect(errors).toEqual([]);
    } finally {
      await Promise.all([context.close(), database.end(), owner.api.dispose()]);
    }
  });
}

async function askRulesQuestion(page: Page, question: string): Promise<string> {
  const chat = page.getByTestId("copilot-chat-textarea");
  // The capability probe can take up to 12 seconds before the chat mounts.
  await expect(chat).toBeVisible({ timeout: 30_000 });
  await expect(chat).toBeEnabled();
  await chat.fill(question);
  const responsePromise = page.waitForResponse((response) =>
    response.url().endsWith("/api/copilotkit") &&
    response.request().method() === "POST" &&
    response.headers()["content-type"]?.includes("text/event-stream") === true,
  );
  await chat.press("Enter");
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(body).toContain("RUN_FINISHED");
  expect(body).not.toContain("RUN_ERROR");
  return body;
}

async function readFieldValues(api: APIRequestContext, characterId: string) {
  const response = await api.get(`/api/characters/${characterId}/editor`);
  await expectStatus(response, 200);
  const editor = (await response.json()) as {
    fields: Array<{ id: string; value: unknown; version: number }>;
  };
  return editor.fields.map(({ id, value, version }) => ({ id, value, version }));
}
