import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { Client } from "pg";
import {
  createCharacter,
  createUser,
  e2eDatabaseUrl,
  expectStatus,
  fieldByName,
  loginUser,
  newApiContext,
  saveField,
  testPassword,
} from "./helpers";

test("local auth, authorization, invitation expiry, and session revocation", async ({
  page,
}) => {
  const anonymous = await newApiContext();
  const owner = await createUser("auth-owner");
  const editor = await createUser("auth-editor");
  const stranger = await createUser("auth-stranger");
  const character = await createCharacter(owner.api, "auth");
  const nameField = fieldByName(character, "acceptance.name");

  await expectStatus(await owner.api.get("/api/auth/session"), 200);
  await expectStatus(await owner.api.post("/api/auth/logout"), 204);
  await expectStatus(await owner.api.get("/api/auth/session"), 401);
  await expectStatus(
    await owner.api.post("/api/auth/login", {
      data: { email: owner.email, password: testPassword },
    }),
    200,
  );

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/auth\/sign-in/);

  const invitation = await owner.api.post(
    `/api/characters/${character.id}/invites`,
  );
  await expectStatus(invitation, 201);
  const { token } = (await invitation.json()) as { token: string };
  await expectStatus(
    await editor.api.post("/api/invitations/accept", { data: { token } }),
    200,
  );

  await expectStatus(
    await editor.api.get(`/api/characters/${character.id}/editor`),
    200,
  );
  await saveField(
    editor.api,
    character.id,
    nameField.id,
    "Edited by collaborator",
  );
  await expectStatus(
    await editor.api.patch(`/api/characters/${character.id}`, {
      data: { name: "Renamed by collaborator" },
    }),
    200,
  );
  await expectStatus(
    await editor.api.post(`/api/characters/${character.id}/invites`),
    403,
  );
  await expectStatus(
    await editor.api.post(`/api/characters/${character.id}/trash`),
    403,
  );
  await expectStatus(
    await stranger.api.get(`/api/characters/${character.id}`),
    404,
  );

  const expiringInvitation = await owner.api.post(
    `/api/characters/${character.id}/invites`,
  );
  await expectStatus(expiringInvitation, 201);
  const expired = (await expiringInvitation.json()) as { token: string };
  const database = new Client({ connectionString: e2eDatabaseUrl });
  await database.connect();
  try {
    await database.query(
      `update character_invites
       set expires_at = now() - interval '1 minute'
       where token_hash = $1`,
      [createHash("sha256").update(expired.token).digest("hex")],
    );
  } finally {
    await database.end();
  }
  await expectStatus(
    await stranger.api.post("/api/invitations/accept", {
      data: { token: expired.token },
    }),
    410,
  );

  const oldSession = await loginUser(owner.email);
  const currentSession = await loginUser(owner.email);
  const newPassword = "new correct horse battery staple";
  await expectStatus(
    await currentSession.post("/api/auth/change-password", {
      data: {
        currentPassword: testPassword,
        newPassword,
      },
    }),
    200,
  );
  await expectStatus(await oldSession.get("/api/auth/session"), 401);
  await expectStatus(await currentSession.get("/api/auth/session"), 200);

  await expectStatus(
    await anonymous.post("/api/auth/request-password-reset", {
      data: { email: owner.email },
    }),
    503,
  );

  await Promise.all([
    anonymous.dispose(),
    owner.api.dispose(),
    editor.api.dispose(),
    stranger.api.dispose(),
    oldSession.dispose(),
    currentSession.dispose(),
  ]);
});
