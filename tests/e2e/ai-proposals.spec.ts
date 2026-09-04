import { expect, test } from "@playwright/test";
import { Client } from "pg";
import {
  createCharacter,
  createUser,
  e2eBaseUrl,
  e2eDatabaseUrl,
  expectStatus,
  saveField,
} from "./helpers";

test("deterministic AI creates a private preview and applies only non-conflicting items", async ({
  browser,
}) => {
  const owner = await createUser("ai-owner");
  const collaborator = await createUser("ai-collaborator");
  const character = await createCharacter(owner.api, "ai-proposal");
  const invite = await owner.api.post(
    `/api/characters/${character.id}/invites`,
  );
  await expectStatus(invite, 201);
  await expectStatus(
    await collaborator.api.post("/api/invitations/accept", {
      data: { token: ((await invite.json()) as { token: string }).token },
    }),
    200,
  );

  const capability = await owner.api.get("/api/ai/capabilities");
  await expectStatus(capability, 200);
  expect(await capability.json()).toMatchObject({
    configured: true,
    toolCalls: true,
  });

  const context = await browser.newContext({
    storageState: await owner.api.storageState(),
  });
  const page = await context.newPage();
  const aguiStreams: string[] = [];
  page.on("response", (response) => {
    if (!response.url().endsWith("/api/copilotkit")) return;
    void response
      .text()
      .then((body) => aguiStreams.push(body))
      .catch(() => undefined);
  });

  await page.goto(`${e2eBaseUrl}/characters/${character.id}`);
  const chat = page.getByTestId("copilot-chat-textarea");
  await expect(chat).toBeVisible();
  await chat.fill("Заполни имя и биографию для acceptance-проверки");
  // The composer can appear before the runtime has enabled submission.
  await page.getByTestId("copilot-send-button").click();
  await expect(
    page.getByText(/Предлагаемые изменения|Proposed changes/),
  ).toBeVisible({ timeout: 30_000 });

  await expect
    .poll(() => aguiStreams.join("\n"))
    .toContain("RUN_STARTED");
  expect(aguiStreams.join("\n")).toContain("RUN_FINISHED");

  const database = new Client({ connectionString: e2eDatabaseUrl });
  await database.connect();
  const proposal = await database.query<{
    proposal_id: string;
    item_id: string;
    field_id: string;
    new_value: unknown;
    expected_version: number;
  }>(
    `select proposal.id as proposal_id,
            item.id as item_id,
            item.field_id,
            item.new_value,
            item.expected_version
       from ai_proposals proposal
       join ai_proposal_items item on item.proposal_id = proposal.id
      where proposal.character_id = $1 and proposal.user_id = $2
      order by item.created_at, item.id`,
    [character.id, owner.id],
  );
  expect(proposal.rows).toHaveLength(2);

  const beforeApply = await owner.api.get(
    `/api/characters/${character.id}/editor`,
  );
  await expectStatus(beforeApply, 200);
  const beforeFields = (
    (await beforeApply.json()) as {
      fields: Array<{ id: string; value: unknown; version: number }>;
    }
  ).fields;
  for (const item of proposal.rows) {
    expect(beforeFields.find((field) => field.id === item.field_id)).toMatchObject({
      value: null,
      version: 0,
    });
  }

  await expectStatus(
    await collaborator.api.get(
      `/api/ai/proposals/${proposal.rows[0]!.proposal_id}`,
    ),
    404,
  );
  const collaboratorHistory = await collaborator.api.get(
    `/api/characters/${character.id}/ai-threads`,
  );
  await expectStatus(collaboratorHistory, 200);
  expect((await collaboratorHistory.json()).threads).toEqual([]);

  const conflicted = proposal.rows[0]!;
  const accepted = proposal.rows[1]!;
  await saveField(
    owner.api,
    character.id,
    conflicted.field_id,
    "Concurrent manual value",
    conflicted.expected_version,
  );

  const batchResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/characters/${character.id}/field-batches`) &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: /Применить|Apply/ }).click();
  const batchResponse = await batchResponsePromise;
  expect(batchResponse.status()).toBe(200);
  const batch = (await batchResponse.json()) as {
    applied: Array<{ fieldId: string; value: unknown }>;
    conflicts: Array<{ fieldId: string; reason: string }>;
  };
  expect(batch.applied).toEqual([
    expect.objectContaining({
      fieldId: accepted.field_id,
      value: accepted.new_value,
    }),
  ]);
  expect(batch.conflicts).toEqual([
    expect.objectContaining({
      fieldId: conflicted.field_id,
      reason: "version_conflict",
    }),
  ]);
  await expect(
    page.getByText(/Часть полей уже изменилась|Some fields have changed/),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.locator("input, textarea").evaluateAll(
        (elements, value) =>
          elements.some(
            (element) =>
              (element as HTMLInputElement | HTMLTextAreaElement).value ===
              value,
          ),
        String(accepted.new_value),
      ),
    )
    .toBe(true);

  const afterApply = await owner.api.get(
    `/api/characters/${character.id}/editor`,
  );
  await expectStatus(afterApply, 200);
  const afterFields = (
    (await afterApply.json()) as {
      fields: Array<{ id: string; value: unknown; version: number }>;
    }
  ).fields;
  expect(afterFields.find((field) => field.id === conflicted.field_id)).toMatchObject(
    { value: "Concurrent manual value", version: 1 },
  );
  expect(afterFields.find((field) => field.id === accepted.field_id)).toMatchObject(
    { value: accepted.new_value, version: 1 },
  );

  const ownerHistory = await owner.api.get(
    `/api/characters/${character.id}/ai-threads`,
  );
  await expectStatus(ownerHistory, 200);
  expect((await ownerHistory.json()).threads).toHaveLength(1);

  await database.end();
  await Promise.all([
    context.close(),
    owner.api.dispose(),
    collaborator.api.dispose(),
  ]);
});
