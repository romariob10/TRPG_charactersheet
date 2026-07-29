import {
  expect,
  request as requestFactory,
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFForm,
} from "pdf-lib";

export const e2eBaseUrl =
  process.env.E2E_BASE_URL ?? "http://localhost:8181";
export const e2eDatabaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://mycharacter:mycharacter@postgres:5432/mycharacter";
export const testPassword = "correct horse battery staple";
let clientSequence = 0;

export interface TestUser {
  api: APIRequestContext;
  email: string;
  id: string;
  password: string;
}

export interface TestTemplate {
  fields: Array<{
    id: string;
    kind: string;
    options: string[];
    pdfName: string;
  }>;
  id: string;
}

export interface TestCharacter {
  fields: TestTemplate["fields"];
  id: string;
  templateId: string;
}

export function newApiContext(): Promise<APIRequestContext> {
  const clientOctet = 10 + (clientSequence++ % 230);
  return requestFactory.newContext({
    baseURL: e2eBaseUrl,
    extraHTTPHeaders: {
      origin: e2eBaseUrl,
      "x-e2e-client-ip": `198.51.100.${clientOctet}`,
    },
  });
}

export async function createUser(prefix: string): Promise<TestUser> {
  const api = await newApiContext();
  const email = `${prefix}-${Date.now()}-${crypto.randomUUID()}@example.com`;
  const response = await api.post("/api/auth/register", {
    data: { email, password: testPassword },
  });
  await expectStatus(response, 201);
  const body = (await response.json()) as { user: { id: string } };
  return { api, email, id: body.user.id, password: testPassword };
}

export async function loginUser(
  email: string,
  password = testPassword,
): Promise<APIRequestContext> {
  const api = await newApiContext();
  await expectStatus(
    await api.post("/api/auth/login", { data: { email, password } }),
    200,
  );
  return api;
}

export async function createTemplate(
  api: APIRequestContext,
  prefix: string,
): Promise<TestTemplate> {
  const upload = await api.post("/api/templates", {
    multipart: {
      allowVision: "false",
      file: {
        buffer: Buffer.from(await createSyntheticAcroForm()),
        mimeType: "application/pdf",
        name: `${prefix}.pdf`,
      },
      forceDuplicate: "true",
      gameSystem: "Acceptance Test",
      publishCommunity: "false",
      title: `Acceptance ${prefix}`,
    },
  });
  await expectStatus(upload, 201);
  const { templateId } = (await upload.json()) as { templateId: string };

  let editor: {
    catalogStatus: string;
    fields: TestTemplate["fields"];
  } | null = null;
  await expect
    .poll(
      async () => {
        const response = await api.get(`/api/templates/${templateId}/editor`);
        if (!response.ok()) return `http-${response.status()}`;
        editor = (await response.json()) as typeof editor;
        return editor?.catalogStatus;
      },
      {
        message: "The synthetic PDF catalog did not complete.",
        timeout: 60_000,
      },
    )
    .toMatch(/ready|partial/);

  await expectStatus(
    await api.post(`/api/templates/${templateId}/approve`),
    200,
  );
  if (!editor) throw new Error("Template editor data was not loaded.");
  return { id: templateId, fields: editor.fields };
}

export async function createCharacter(
  api: APIRequestContext,
  prefix: string,
): Promise<TestCharacter> {
  const template = await createTemplate(api, prefix);
  const response = await api.post("/api/characters", {
    data: { name: `Character ${prefix}`, templateId: template.id },
  });
  await expectStatus(response, 201);
  const body = (await response.json()) as { id: string };
  return { id: body.id, templateId: template.id, fields: template.fields };
}

export function fieldByName(
  character: Pick<TestCharacter, "fields">,
  pdfName: string,
) {
  const field = character.fields.find((candidate) => candidate.pdfName === pdfName);
  if (!field) throw new Error(`Synthetic field ${pdfName} was not cataloged.`);
  return field;
}

export async function saveField(
  api: APIRequestContext,
  characterId: string,
  fieldId: string,
  value: string | boolean | string[] | null,
  expectedVersion = 0,
) {
  const response = await api.put(
    `/api/characters/${characterId}/fields/${fieldId}`,
    {
      data: {
        clientMutationId: crypto.randomUUID(),
        expectedVersion,
        value,
      },
    },
  );
  await expectStatus(response, 200);
  return (await response.json()) as {
    revision: number;
    updatedBy: string;
    value: typeof value;
    version: number;
  };
}

export async function expectStatus(
  response: APIResponse,
  status: number,
): Promise<void> {
  if (response.status() === status) return;
  const body = await response.text().catch(() => "");
  expect(
    response.status(),
    `${response.url()} returned ${response.status()}: ${body}`,
  ).toBe(status);
}

export async function createSyntheticAcroForm(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const page = document.addPage([612, 792]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  const form = document.getForm();
  const appearance = {
    backgroundColor: rgb(1, 1, 1),
    borderColor: rgb(0.25, 0.3, 0.35),
    borderWidth: 1,
    font,
    textColor: rgb(0.05, 0.08, 0.1),
  };

  page.drawText("MyCharacter synthetic acceptance sheet", {
    x: 40,
    y: 750,
    size: 16,
    font,
  });
  addLabel(page, font, "Name", 40, 700);
  form
    .createTextField("acceptance.name")
    .addToPage(page, { x: 150, y: 690, width: 260, height: 24, ...appearance });

  addLabel(page, font, "Biography", 40, 645);
  const biography = form.createTextField("acceptance.biography");
  biography.enableMultiline();
  biography.addToPage(page, {
    x: 150,
    y: 590,
    width: 360,
    height: 70,
    ...appearance,
  });

  addLabel(page, font, "Heroic", 40, 545);
  form
    .createCheckBox("acceptance.heroic")
    .addToPage(page, { x: 150, y: 538, width: 18, height: 18, ...appearance });

  addLabel(page, font, "Path", 40, 490);
  const path = form.createRadioGroup("acceptance.path");
  path.addOptionToPage("Warrior", page, {
    x: 150,
    y: 484,
    width: 18,
    height: 18,
    ...appearance,
  });
  page.drawText("Warrior", { x: 174, y: 488, size: 10, font });
  path.addOptionToPage("Mage", page, {
    x: 240,
    y: 484,
    width: 18,
    height: 18,
    ...appearance,
  });
  page.drawText("Mage", { x: 264, y: 488, size: 10, font });

  addLabel(page, font, "Origin", 40, 435);
  const origin = form.createDropdown("acceptance.origin");
  origin.addOptions(["North", "South", "East"]);
  origin.addToPage(page, {
    x: 150,
    y: 425,
    width: 180,
    height: 24,
    ...appearance,
  });

  addLabel(page, font, "Skills", 40, 365);
  const skills = createOptionList(form);
  skills.addOptions(["Lore", "Stealth", "Survival"]);
  skills.enableMultiselect();
  skills.addToPage(page, {
    x: 150,
    y: 320,
    width: 180,
    height: 70,
    ...appearance,
  });

  form.updateFieldAppearances(font);
  return document.save();
}

function createOptionList(form: PDFForm) {
  return form.createOptionList("acceptance.skills");
}

function addLabel(
  page: ReturnType<PDFDocument["addPage"]>,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  label: string,
  x: number,
  y: number,
) {
  page.drawText(label, { x, y, size: 11, font });
}
