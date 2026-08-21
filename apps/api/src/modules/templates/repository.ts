import type {
  FieldDescriptor,
  TemplateField,
  TemplateScope,
  TemplateSummary,
} from "@mycharacter/contracts";
import type { Database } from "@mycharacter/database";
import { sql, type Kysely } from "kysely";

export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export interface TemplateRow {
  id: string;
  ownerId: string | null;
  visibility: "private" | "curated";
  title: string;
  slug: string;
  gameSystem: string | null;
  pageCount: number;
  sha256: string;
  catalogStatus: "pending" | "processing" | "ready" | "partial" | "failed";
  approvedAt: Date | null;
  updatedAt: Date;
  isPublic: boolean;
  deletedAt: Date | null;
  subscriberId: string | null;
  authorId: string | null;
  authorUsername: string | null;
  authorDisplayName: string | null;
  likeCount: number | null;
  commentCount: number | null;
  likedByMeCount: number | null;
}

export function templateSummaryFromRow(row: TemplateRow): TemplateSummary {
  return {
    id: row.id,
    title: row.title,
    gameSystem: row.gameSystem,
    pageCount: row.pageCount,
    catalogStatus: row.catalogStatus,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    isPublic: row.isPublic,
    slug: row.slug,
    ...(row.subscriberId ? { subscribed: true } : {}),
    ...(row.deletedAt ? { deletedAt: row.deletedAt.toISOString() } : {}),
    ...(row.authorId && row.authorUsername
      ? {
          author: {
            id: row.authorId,
            username: row.authorUsername,
            displayName: row.authorDisplayName,
          },
        }
      : {}),
    ...(row.likeCount !== null && row.likeCount !== undefined
      ? { likeCount: row.likeCount }
      : {}),
    ...(row.commentCount !== null && row.commentCount !== undefined
      ? { commentCount: row.commentCount }
      : {}),
    ...(row.likedByMeCount !== null && row.likedByMeCount !== undefined
      ? { likedByMe: row.likedByMeCount > 0 }
      : {}),
  };
}

export async function findTemplate(
  db: Kysely<Database>,
  actorId: string,
  templateId: string,
): Promise<TemplateRow | undefined> {
  const row = await baseQuery(db, actorId)
    .where("template.id", "=", templateId)
    .executeTakeFirst();
  return row as TemplateRow | undefined;
}

export async function listTemplates(
  db: Kysely<Database>,
  actorId: string,
  scope: TemplateScope,
): Promise<TemplateRow[]> {
  if (scope === "trash") {
    const cutoff = new Date(Date.now() - TRASH_RETENTION_MS);
    return (await baseQuery(db, actorId)
      .where("template.owner_id", "=", actorId)
      .where("template.deleted_at", "is not", null)
      .where("template.deleted_at", ">=", cutoff)
      .orderBy("template.deleted_at", "desc")
      .execute()) as TemplateRow[];
  }
  let query = baseQuery(db, actorId).where("template.deleted_at", "is", null);
  if (scope === "mine") {
    query = query.where((eb) =>
      eb.or([
        eb("template.owner_id", "=", actorId),
        eb.and([
          eb("subscription.user_id", "=", actorId),
          eb("template.is_public", "=", true),
          eb("template.catalog_approved_at", "is not", null),
          eb("template.catalog_status", "in", ["ready", "partial"]),
        ]),
      ]),
    );
  } else if (scope === "community") {
    query = query
      .where("template.visibility", "=", "private")
      .where("template.is_public", "=", true)
      .where("template.catalog_approved_at", "is not", null)
      .where("template.catalog_status", "in", ["ready", "partial"])
      .where("template.owner_id", "!=", actorId)
      .select([
        (eb) =>
          eb
            .selectFrom("template_likes")
            .select(sql<number>`count(*)::int`.as("count"))
            .whereRef("template_likes.template_id", "=", "template.id")
            .as("likeCount"),
        (eb) =>
          eb
            .selectFrom("template_comments")
            .select(sql<number>`count(*)::int`.as("count"))
            .whereRef("template_comments.template_id", "=", "template.id")
            .as("commentCount"),
        (eb) =>
          eb
            .selectFrom("template_likes")
            .select(sql<number>`count(*)::int`.as("count"))
            .whereRef("template_likes.template_id", "=", "template.id")
            .where("template_likes.user_id", "=", actorId)
            .as("likedByMeCount"),
      ]);
  } else {
    query = query
      .where("template.catalog_approved_at", "is not", null)
      .where("template.catalog_status", "in", ["ready", "partial"])
      .where((eb) =>
        eb.or([
          eb("template.visibility", "=", "curated"),
          eb("template.owner_id", "=", actorId),
          eb.and([
            eb("template.is_public", "=", true),
            eb("subscription.user_id", "=", actorId),
          ]),
        ]),
      );
  }
  return (await query.orderBy("template.updated_at", "desc").execute()) as TemplateRow[];
}

export async function loadTemplateFields(
  db: Kysely<Database>,
  templateId: string,
): Promise<TemplateField[]> {
  const rows = await db
    .selectFrom("pdf_fields")
    .select([
      "id",
      "pdf_name as pdfName",
      "kind",
      "auto_label as autoLabel",
      "auto_aliases as aliases",
      "auto_section as section",
      "page",
      "options",
      "auto_group_id as groupId",
      "auto_group_order as groupOrder",
      "confidence",
      "source",
      "is_enabled as enabled",
    ])
    .where("template_id", "=", templateId)
    .orderBy("page")
    .orderBy("auto_group_order")
    .execute();
  const widgets = rows.length
    ? await db
        .selectFrom("pdf_field_widgets")
        .select([
          "id",
          "field_id as fieldId",
          "page",
          "rect",
          "pdf_rect as pdfRect",
          "rotation",
          "export_value as exportValue",
        ])
        .where("field_id", "in", rows.map((row) => row.id))
        .orderBy("widget_index")
        .execute()
    : [];
  const byField = new Map<string, FieldDescriptor["widgets"]>();
  for (const widget of widgets) {
    const current = byField.get(widget.fieldId) ?? [];
    current.push({
      id: widget.id,
      page: widget.page,
      rect: widget.rect as [number, number, number, number],
      pdfRect: widget.pdfRect as [number, number, number, number],
      rotation: widget.rotation,
      exportValue: widget.exportValue,
    });
    byField.set(widget.fieldId, current);
  }
  return rows.map((row) => ({
    id: row.id,
    pdfName: row.pdfName,
    kind: row.kind,
    label: row.autoLabel?.trim() || row.pdfName,
    aliases: row.aliases,
    section: row.section?.trim() || null,
    page: row.page,
    options: Array.isArray(row.options)
      ? row.options.filter((item): item is string => typeof item === "string")
      : [],
    groupId: row.groupId,
    groupOrder: row.groupOrder,
    confidence: row.confidence,
    source: row.source,
    enabled: row.enabled,
    widgets: byField.get(row.id) ?? [],
  }));
}

export async function listPublicTemplatesByOwner(
  db: Kysely<Database>,
  ownerId: string,
  actorId = ownerId,
): Promise<TemplateRow[]> {
  return (await baseQuery(db, actorId)
    .where("template.owner_id", "=", ownerId)
    .where("template.deleted_at", "is", null)
    .where("template.visibility", "=", "private")
    .where("template.is_public", "=", true)
    .where("template.catalog_approved_at", "is not", null)
    .where("template.catalog_status", "in", ["ready", "partial"])
    .select([
      (eb) =>
        eb
          .selectFrom("template_likes")
          .select(sql<number>`count(*)::int`.as("count"))
          .whereRef("template_likes.template_id", "=", "template.id")
          .as("likeCount"),
      (eb) =>
        eb
          .selectFrom("template_comments")
          .select(sql<number>`count(*)::int`.as("count"))
          .whereRef("template_comments.template_id", "=", "template.id")
          .as("commentCount"),
      (eb) =>
        eb
          .selectFrom("template_likes")
          .select(sql<number>`count(*)::int`.as("count"))
          .whereRef("template_likes.template_id", "=", "template.id")
          .where("template_likes.user_id", "=", actorId)
          .as("likedByMeCount"),
    ])
    .orderBy("template.updated_at", "desc")
    .execute()) as TemplateRow[];
}

function baseQuery(db: Kysely<Database>, actorId: string) {
  return db
    .selectFrom("pdf_templates as template")
    .leftJoin("template_subscriptions as subscription", (join) =>
      join
        .onRef("subscription.template_id", "=", "template.id")
        .on("subscription.user_id", "=", actorId),
    )
    .leftJoin("profiles as author", "author.id", "template.owner_id")
    .select([
      "template.id",
      "template.owner_id as ownerId",
      "template.visibility",
      "template.title",
      "template.slug",
      "template.game_system as gameSystem",
      "template.page_count as pageCount",
      "template.sha256",
      "template.catalog_status as catalogStatus",
      "template.catalog_approved_at as approvedAt",
      "template.updated_at as updatedAt",
      "template.is_public as isPublic",
      "template.deleted_at as deletedAt",
      "subscription.user_id as subscriberId",
      "author.id as authorId",
      "author.username as authorUsername",
      "author.display_name as authorDisplayName",
    ]);
}
