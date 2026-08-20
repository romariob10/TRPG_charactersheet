import { createHash, randomBytes } from "node:crypto";
import type {
  CharacterEditorData,
  CharacterSummary,
  CreateCharacterRequest,
  InviteUserRequest,
  UpdateCharacterRequest,
} from "@mycharacter/contracts";
import type { Database } from "@mycharacter/database";
import type { Kysely } from "kysely";
import { AppError } from "../../errors.js";
import { DirectMessageService } from "../messages/service.js";
import { NotificationService } from "../notifications/service.js";
import { WorkspaceService } from "../workspace/service.js";
import {
  findCharacterAccess,
  loadCharacterFields,
  listCharacters,
  type CharacterAccessRow,
  type CharacterDatabase,
} from "./repository.js";

export type CharacterCapability =
  | "read"
  | "edit"
  | "invite"
  | "trash"
  | "restore"
  | "delete";

export class CharacterService {
  private readonly db: Kysely<Database>;

  public constructor(database: Kysely<Database>) {
    this.db = database;
  }

  async list(actorId: string): Promise<CharacterSummary[]> {
    return (await listCharacters(this.db, actorId)).map((row) =>
      this.toSummary(row, actorId),
    );
  }

  async get(actorId: string, characterId: string): Promise<CharacterSummary> {
    const row = await this.authorizeCharacter(actorId, characterId, "read");
    return this.toSummary(row, actorId);
  }

  async getEditor(actorId: string, characterId: string): Promise<CharacterEditorData> {
    const row = await this.authorizeCharacter(actorId, characterId, "read");
    return {
      id: row.id,
      name: row.name,
      role: row.ownerId === actorId ? "owner" : "editor",
      revision: Number(row.revision),
      templateId: row.templateId,
      catalogStatus: row.catalogStatus,
      fields: await loadCharacterFields(this.db, row.id, row.templateId),
      pdfUrl: `/api/characters/${row.id}/pdf`,
      currentUserId: actorId,
    };
  }

  async create(actorId: string, input: CreateCharacterRequest): Promise<CharacterSummary> {
    const template = await this.db
      .selectFrom("pdf_templates as template")
      .leftJoin("template_subscriptions as subscription", (join) =>
        join
          .onRef("subscription.template_id", "=", "template.id")
          .on("subscription.user_id", "=", actorId),
      )
      .select([
        "template.id",
        "template.owner_id as ownerId",
        "template.visibility",
        "template.is_public as isPublic",
        "template.catalog_status as catalogStatus",
        "template.catalog_approved_at as approvedAt",
        "template.deleted_at as deletedAt",
        "subscription.user_id as subscriberId",
      ])
      .where("template.id", "=", input.templateId)
      .executeTakeFirst();
    const ready = template && ["ready", "partial"].includes(template.catalogStatus);
    const available =
      template &&
      template.deletedAt === null &&
      ready &&
      template.approvedAt !== null &&
      (template.visibility === "curated" ||
        template.ownerId === actorId ||
        (template.isPublic && template.subscriberId === actorId));
    if (!available) {
      throw notFound();
    }

    const characterId = await this.db.transaction().execute(async (trx) => {
      const created = await trx
        .insertInto("characters")
        .values({
          template_id: input.templateId,
          owner_id: actorId,
          name: input.name,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      await trx
        .insertInto("character_values")
        .columns(["character_id", "field_id", "value", "version", "updated_by"])
        .expression((eb) =>
          eb
            .selectFrom("pdf_fields")
            .select([
              eb.val(created.id).as("character_id"),
              "id",
              "default_value",
              eb.val(0).as("version"),
              eb.val(actorId).as("updated_by"),
            ])
            .where("template_id", "=", input.templateId)
            .where("is_enabled", "=", true),
        )
        .execute();
      return created.id;
    });

    const workspace = new WorkspaceService(this.db);
    await workspace.recordActivity(actorId, "character", characterId, {
      markSeen: true,
    });
    await workspace.recordActivity(actorId, "system", input.templateId, {
      markSeen: true,
    });

    return this.get(actorId, characterId);
  }

  async update(actorId: string, characterId: string, input: UpdateCharacterRequest): Promise<CharacterSummary> {
    const character = await this.authorizeCharacter(actorId, characterId, "edit");
    if (input.isPublic !== undefined && character.ownerId !== actorId) {
      throw forbidden();
    }
    await this.db
      .updateTable("characters")
      .set({
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.isPublic === undefined
          ? {}
          : {
              is_public: input.isPublic,
              published_at: input.isPublic ? character.publishedAt ?? new Date() : null,
            }),
      })
      .where("id", "=", characterId)
      .execute();
    return this.get(actorId, characterId);
  }

  async clone(actorId: string, characterId: string, requestedName?: string): Promise<CharacterSummary> {
    const id = await this.db.transaction().execute(async (trx) => {
      const source = await this.authorizeCharacter(actorId, characterId, "read", trx);
      if (source.ownerId !== actorId) {
        throw forbidden();
      }
      const created = await trx
        .insertInto("characters")
        .values({
          template_id: source.templateId,
          owner_id: actorId,
          name: requestedName?.trim() || `${source.name} — copy`,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      await trx
        .insertInto("character_values")
        .columns(["character_id", "field_id", "value", "version", "updated_by"])
        .expression((eb) =>
          eb
            .selectFrom("character_values")
            .select([
              eb.val(created.id).as("character_id"),
              "field_id",
              "value",
              eb.val(0).as("version"),
              eb.val(actorId).as("updated_by"),
            ])
            .where("character_id", "=", characterId),
        )
        .execute();
      return created.id;
    });
    return this.get(actorId, id);
  }

  async trash(actorId: string, characterId: string): Promise<CharacterSummary> {
    await this.authorizeCharacter(actorId, characterId, "trash");
    await this.db
      .updateTable("characters")
      .set({ status: "trashed", deleted_at: new Date(), is_public: false, published_at: null })
      .where("id", "=", characterId)
      .execute();
    return this.get(actorId, characterId);
  }

  async restore(actorId: string, characterId: string): Promise<CharacterSummary> {
    await this.authorizeCharacter(actorId, characterId, "restore");
    await this.db
      .updateTable("characters")
      .set({ status: "active", deleted_at: null })
      .where("id", "=", characterId)
      .execute();
    return this.get(actorId, characterId);
  }

  async permanentlyDelete(actorId: string, characterId: string): Promise<void> {
    await this.authorizeCharacter(actorId, characterId, "delete");
    await this.db.deleteFrom("characters").where("id", "=", characterId).execute();
  }

  async createInvite(actorId: string, characterId: string): Promise<{ token: string; expiresAt: string }> {
    await this.authorizeCharacter(actorId, characterId, "invite");
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.db
      .insertInto("character_invites")
      .values({
        character_id: characterId,
        token_hash: hashToken(token),
        created_by: actorId,
        expires_at: expiresAt,
      })
      .execute();
    return { token, expiresAt: expiresAt.toISOString() };
  }

  async inviteUser(
    actorId: string,
    characterId: string,
    input: InviteUserRequest,
  ): Promise<{ token: string; expiresAt: string; recipientUsername: string }> {
    await this.authorizeCharacter(actorId, characterId, "invite");
    const character = await this.get(actorId, characterId);
    const inviter = await this.db
      .selectFrom("profiles")
      .select(["username", "display_name as displayName"])
      .where("id", "=", actorId)
      .executeTakeFirst();

    let targetUser: { id: string; username: string } | undefined;
    if (input.userId) {
      targetUser = await this.db
        .selectFrom("profiles")
        .select(["id", "username"])
        .where("id", "=", input.userId)
        .executeTakeFirst();
    } else if (input.username) {
      targetUser = await this.db
        .selectFrom("profiles")
        .select(["id", "username"])
        .where("username", "=", input.username.toLowerCase())
        .executeTakeFirst();
    }

    if (!targetUser) {
      throw new AppError("USER_NOT_FOUND", 404, "User not found.");
    }
    if (targetUser.id === actorId) {
      throw new AppError("INVITE_SELF", 400, "You cannot invite yourself.");
    }

    const invite = await this.createInvite(actorId, characterId);
    const inviterName = inviter?.displayName || (inviter?.username ? `@${inviter.username}` : "Пользователь");

    // Send direct message with invite link
    const directMessageService = new DirectMessageService(this.db);
    const conversationId = await directMessageService.getOrCreateConversation(actorId, targetUser.id);
    await directMessageService.sendMessage(
      actorId,
      conversationId,
      `Привет! Приглашаю тебя редактировать лист персонажа «${character.name}»!\nПерейди по ссылке для входа: /invites/${invite.token}`,
    );

    // Send notification
    await new NotificationService(this.db).notify({
      userId: targetUser.id,
      actorId,
      type: "character_invite",
      targetType: "character",
      targetId: characterId,
      title: "Приглашение к редактированию",
      body: `${inviterName} пригласил вас редактировать персонажа «${character.name}».`,
    });

    return {
      token: invite.token,
      expiresAt: invite.expiresAt,
      recipientUsername: targetUser.username,
    };
  }

  async acceptInvite(actorId: string, token: string): Promise<{ characterId: string }> {
    return this.db.transaction().execute(async (trx) => {
      const invite = await trx
        .selectFrom("character_invites as invite")
        .innerJoin("characters as character", "character.id", "invite.character_id")
        .select([
          "invite.id",
          "invite.character_id as characterId",
          "invite.expires_at as expiresAt",
          "invite.accepted_at as acceptedAt",
          "invite.revoked_at as revokedAt",
          "character.owner_id as ownerId",
          "character.status",
        ])
        .where("invite.token_hash", "=", hashToken(token))
        .forUpdate()
        .executeTakeFirst();
      if (!invite || invite.revokedAt || invite.acceptedAt || invite.status !== "active") {
        throw notFound("Invitation is invalid.");
      }
      if (invite.expiresAt.getTime() <= Date.now()) {
        throw new AppError("INVITATION_EXPIRED", 410, "Invitation has expired.");
      }
      if (invite.ownerId === actorId) {
        throw new AppError("INVITATION_OWNER_CONFLICT", 409, "The owner already has access.");
      }
      await trx
        .insertInto("character_members")
        .values({ character_id: invite.characterId, user_id: actorId, role: "editor" })
        .onConflict((oc) => oc.columns(["character_id", "user_id"]).doNothing())
        .execute();
      await trx
        .updateTable("character_invites")
        .set({ accepted_by: actorId, accepted_at: new Date() })
        .where("id", "=", invite.id)
        .execute();
      return { characterId: invite.characterId };
    });
  }

  async authorizeCharacter(
    actorId: string,
    characterId: string,
    capability: CharacterCapability,
    db: CharacterDatabase = this.db,
  ): Promise<CharacterAccessRow> {
    const row = await findCharacterAccess(db, actorId, characterId);
    if (!row) {
      throw notFound();
    }
    const owner = row.ownerId === actorId;
    const editor = row.memberRole === "editor";
    const active = row.status === "active";
    const allowed =
      capability === "read"
        ? owner || (editor && active)
        : capability === "edit"
          ? active && (owner || editor)
          : capability === "invite" || capability === "trash"
            ? active && owner
            : capability === "restore"
              ? owner &&
                !active &&
                row.deletedAt !== null &&
                row.deletedAt.getTime() > Date.now() - 30 * 24 * 60 * 60 * 1000
              : owner && !active;
    if (!owner && !editor) {
      throw notFound();
    }
    if (!allowed) {
      throw forbidden();
    }
    return row;
  }

  private toSummary(row: CharacterAccessRow, actorId: string): CharacterSummary {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      isPublic: row.isPublic,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      gameSystem: row.gameSystem,
      likeCount: row.likeCount,
      likedByMe: row.likedByMeCount > 0,
      role: row.ownerId === actorId ? "owner" : "editor",
      revision: Number(row.revision),
      status: row.status,
      catalogStatus: row.catalogStatus,
      pageCount: row.pageCount,
      updatedAt: row.updatedAt.toISOString(),
      deletedAt: row.deletedAt?.toISOString() ?? null,
    };
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function notFound(message = "Character not found."): AppError {
  return new AppError("NOT_FOUND", 404, message);
}

function forbidden(): AppError {
  return new AppError("FORBIDDEN", 403, "This action is not allowed.");
}
