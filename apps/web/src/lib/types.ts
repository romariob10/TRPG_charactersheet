export type FieldValue = string | boolean | string[] | null;

export type FieldKind =
  | "text"
  | "multiline"
  | "checkbox"
  | "radio"
  | "dropdown"
  | "list"
  | "button"
  | "signature"
  | "unknown";

export type CatalogSource = "pdf" | "heuristic" | "ocr" | "vision" | "manual";

export type CatalogStatus =
  "pending" | "processing" | "ready" | "partial" | "failed";

export interface FieldWidget {
  id: string;
  page: number;
  rect: [number, number, number, number];
  pdfRect: [number, number, number, number];
  rotation: number;
  exportValue?: string | null;
}

export interface FieldDescriptor {
  id: string;
  pdfName: string;
  kind: FieldKind;
  label: string;
  aliases: string[];
  section: string | null;
  page: number;
  options: string[];
  groupId: string | null;
  groupOrder: number | null;
  confidence: number;
  source: CatalogSource;
  widgets: FieldWidget[];
}

export interface CharacterField extends FieldDescriptor {
  value: FieldValue;
  version: number;
  updatedAt: string;
  updatedBy: string | null;
}

export interface TemplateField extends FieldDescriptor {
  enabled: boolean;
}

export interface CharacterSummary {
  id: string;
  name: string;
  role: "owner" | "editor";
  revision: number;
  status: "active" | "trashed";
  catalogStatus: CatalogStatus;
  pageCount: number;
  updatedAt: string;
  deletedAt: string | null;
}

export interface TemplateSummary {
  id: string;
  title: string;
  gameSystem: string | null;
  pageCount: number;
  catalogStatus: CatalogStatus;
  approvedAt: string | null;
  updatedAt: string;
  isPublic: boolean;
  subscribed?: boolean;
}

export interface TemplateEditorData extends TemplateSummary {
  fields: TemplateField[];
  pdfUrl: string;
}

export interface CharacterEditorData {
  id: string;
  name: string;
  role: "owner" | "editor";
  revision: number;
  templateId: string;
  catalogStatus: CharacterSummary["catalogStatus"];
  fields: CharacterField[];
  pdfUrl: string;
  currentUserId: string;
}

export interface FieldMutationResponse {
  value: FieldValue;
  version: number;
  revision: number;
  overwrittenRemote: boolean;
  updatedAt: string;
  updatedBy: string;
}
