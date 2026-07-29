import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import {
  createCharacter,
  createUser,
  expectStatus,
  fieldByName,
  saveField,
} from "./helpers";

test("synthetic AcroForm completes upload, editing, export, trash, restore, and deletion", async () => {
  const owner = await createUser("pdf-owner");
  const character = await createCharacter(owner.api, "pdf-lifecycle");
  const fields = {
    biography: fieldByName(character, "acceptance.biography"),
    heroic: fieldByName(character, "acceptance.heroic"),
    name: fieldByName(character, "acceptance.name"),
    origin: fieldByName(character, "acceptance.origin"),
    path: fieldByName(character, "acceptance.path"),
    skills: fieldByName(character, "acceptance.skills"),
  };

  expect(fields.biography.kind).toBe("multiline");
  expect(fields.heroic.kind).toBe("checkbox");
  expect(fields.name.kind).toBe("text");
  expect(fields.origin.kind).toBe("dropdown");
  expect(fields.path.kind).toBe("radio");
  expect(fields.skills.kind).toBe("list");

  await saveField(owner.api, character.id, fields.name.id, "Алиса");
  await saveField(
    owner.api,
    character.id,
    fields.biography.id,
    "Первая строка\nВторая строка",
  );
  await saveField(owner.api, character.id, fields.heroic.id, true);
  await saveField(owner.api, character.id, fields.path.id, "Mage");
  await saveField(owner.api, character.id, fields.origin.id, "South");
  await saveField(owner.api, character.id, fields.skills.id, [
    "Lore",
    "Survival",
  ]);

  const interactiveResponse = await owner.api.post(
    `/api/characters/${character.id}/export?mode=interactive`,
  );
  await expectStatus(interactiveResponse, 200);
  expect(interactiveResponse.headers()["content-type"]).toContain(
    "application/pdf",
  );
  const interactive = await PDFDocument.load(await interactiveResponse.body());
  const form = interactive.getForm();
  expect(form.getTextField("acceptance.name").getText()).toBe("Алиса");
  expect(form.getTextField("acceptance.biography").getText()).toContain(
    "Вторая строка",
  );
  expect(form.getCheckBox("acceptance.heroic").isChecked()).toBe(true);
  expect(form.getRadioGroup("acceptance.path").getSelected()).toBe("Mage");
  expect(form.getDropdown("acceptance.origin").getSelected()).toEqual(["South"]);
  expect(form.getOptionList("acceptance.skills").getSelected()).toEqual([
    "Lore",
    "Survival",
  ]);

  const flattenedResponse = await owner.api.post(
    `/api/characters/${character.id}/export?mode=flattened`,
  );
  await expectStatus(flattenedResponse, 200);
  const flattened = await PDFDocument.load(await flattenedResponse.body());
  expect(flattened.getForm().getFields()).toHaveLength(0);

  await expectStatus(
    await owner.api.post(`/api/characters/${character.id}/trash`),
    200,
  );
  const trashed = await owner.api.get(`/api/characters/${character.id}`);
  await expectStatus(trashed, 200);
  expect((await trashed.json()).status).toBe("trashed");

  await expectStatus(
    await owner.api.post(`/api/characters/${character.id}/restore`),
    200,
  );
  const restored = await owner.api.get(`/api/characters/${character.id}`);
  await expectStatus(restored, 200);
  expect((await restored.json()).status).toBe("active");

  await expectStatus(
    await owner.api.post(`/api/characters/${character.id}/trash`),
    200,
  );
  await expectStatus(
    await owner.api.delete(`/api/characters/${character.id}`),
    204,
  );
  await expectStatus(
    await owner.api.get(`/api/characters/${character.id}`),
    404,
  );
  await owner.api.dispose();
});
