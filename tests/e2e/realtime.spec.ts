import { expect, test } from "@playwright/test";
import {
  createCharacter,
  createUser,
  e2eBaseUrl,
  expectStatus,
  fieldByName,
  saveField,
} from "./helpers";

test("two browser contexts receive authoritative realtime events and catch up after reconnect", async ({
  browser,
}) => {
  const owner = await createUser("realtime-owner");
  const editor = await createUser("realtime-editor");
  const character = await createCharacter(owner.api, "realtime");
  const field = fieldByName(character, "acceptance.name");

  const invite = await owner.api.post(
    `/api/characters/${character.id}/invites`,
  );
  await expectStatus(invite, 201);
  await expectStatus(
    await editor.api.post("/api/invitations/accept", {
      data: { token: ((await invite.json()) as { token: string }).token },
    }),
    200,
  );

  const ownerContext = await browser.newContext({
    storageState: await owner.api.storageState(),
  });
  const editorContext = await browser.newContext({
    storageState: await editor.api.storageState(),
  });
  const ownerPage = await ownerContext.newPage();
  const editorPage = await editorContext.newPage();
  await Promise.all([ownerPage.goto(e2eBaseUrl), editorPage.goto(e2eBaseUrl)]);

  await Promise.all([
    connectRealtime(ownerPage, character.id, 0),
    connectRealtime(editorPage, character.id, 0),
  ]);

  const ownerChange = await saveField(
    owner.api,
    character.id,
    field.id,
    "Owner revision",
  );
  await Promise.all([
    expectEvent(ownerPage, "field.changed", ownerChange.revision),
    expectEvent(editorPage, "field.changed", ownerChange.revision),
  ]);

  const editorChange = await saveField(
    editor.api,
    character.id,
    field.id,
    "Editor revision",
    ownerChange.version,
  );
  await Promise.all([
    expectEvent(ownerPage, "field.changed", editorChange.revision),
    expectEvent(editorPage, "field.changed", editorChange.revision),
  ]);

  await editorPage.evaluate(() => {
    const state = window as typeof window & {
      __acceptanceSocket?: WebSocket;
    };
    state.__acceptanceSocket?.close(1000, "acceptance disconnect");
  });

  const disconnectedChange = await saveField(
    owner.api,
    character.id,
    field.id,
    "Changed while disconnected",
    editorChange.version,
  );
  await expectEvent(ownerPage, "field.changed", disconnectedChange.revision);

  const catchUp = await editor.api.get(
    `/api/characters/${character.id}/changes?afterRevision=${editorChange.revision}`,
  );
  await expectStatus(catchUp, 200);
  expect(await catchUp.json()).toMatchObject({
    mode: "changes",
    revision: disconnectedChange.revision,
    changes: [
      {
        fieldId: field.id,
        revision: disconnectedChange.revision,
        value: "Changed while disconnected",
        version: disconnectedChange.version,
      },
    ],
  });

  await connectRealtime(
    editorPage,
    character.id,
    editorChange.revision,
  );
  await expectEvent(editorPage, "subscribed", disconnectedChange.revision);

  const [ownerSnapshot, editorSnapshot] = await Promise.all([
    ownerPage.evaluate(async (id) => {
      const response = await fetch(`/api/characters/${id}/editor`);
      return response.json();
    }, character.id),
    editorPage.evaluate(async (id) => {
      const response = await fetch(`/api/characters/${id}/editor`);
      return response.json();
    }, character.id),
  ]);
  for (const snapshot of [ownerSnapshot, editorSnapshot] as Array<{
    revision: number;
    fields: Array<{ id: string; value: unknown; version: number }>;
  }>) {
    expect(snapshot.revision).toBe(disconnectedChange.revision);
    expect(snapshot.fields.find((item) => item.id === field.id)).toMatchObject({
      value: "Changed while disconnected",
      version: disconnectedChange.version,
    });
  }

  await Promise.all([
    ownerContext.close(),
    editorContext.close(),
    owner.api.dispose(),
    editor.api.dispose(),
  ]);
});

async function connectRealtime(
  page: import("@playwright/test").Page,
  characterId: string,
  afterRevision: number,
) {
  await page.evaluate(
    ({ afterRevision, characterId }) =>
      new Promise<void>((resolve, reject) => {
        const state = window as typeof window & {
          __acceptanceEvents?: Array<Record<string, unknown>>;
          __acceptanceSocket?: WebSocket;
        };
        state.__acceptanceEvents = [];
        const protocol = location.protocol === "https:" ? "wss:" : "ws:";
        const socket = new WebSocket(
          `${protocol}//${location.host}/api/realtime`,
        );
        state.__acceptanceSocket = socket;
        const timer = window.setTimeout(
          () => reject(new Error("Realtime connection timed out.")),
          5_000,
        );
        socket.addEventListener("open", () => {
          socket.send(
            JSON.stringify({
              protocolVersion: 1,
              type: "subscribe",
              characterId,
              afterRevision,
            }),
          );
        });
        socket.addEventListener("message", (event) => {
          const message = JSON.parse(String(event.data)) as Record<
            string,
            unknown
          >;
          state.__acceptanceEvents?.push(message);
          if (message.type === "subscribed") {
            window.clearTimeout(timer);
            resolve();
          }
        });
        socket.addEventListener("error", () => {
          window.clearTimeout(timer);
          reject(new Error("Realtime connection failed."));
        });
      }),
    { afterRevision, characterId },
  );
}

async function expectEvent(
  page: import("@playwright/test").Page,
  type: string,
  revision: number,
) {
  await expect
    .poll(async () =>
      page.evaluate(
        ({ revision, type }) => {
          const events = (
            window as typeof window & {
              __acceptanceEvents?: Array<Record<string, unknown>>;
            }
          ).__acceptanceEvents;
          return events?.some(
            (event) => event.type === type && event.revision === revision,
          );
        },
        { revision, type },
      ),
    )
    .toBe(true);
}
