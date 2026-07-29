import {
  type AiAppliedChange,
  type AiProposalStatus,
  type ApplyProposalResponse,
  type FieldValue,
} from "@mycharacter/contracts";
import type { Database } from "@mycharacter/database";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import { AppError } from "../../errors.js";
import type { RealtimeBus } from "../../realtime/realtime-bus.js";
import { CharacterService } from "../characters/service.js";
import { validateFieldValue } from "../fields/value-validation.js";

interface SubmittedProposalItem {
  itemId: string;
  value: FieldValue;
}

export class AiProposalService {
  private readonly db: Kysely<Database>;
  private readonly realtime: RealtimeBus;
  private readonly characters: CharacterService;

  public constructor(
    db: Kysely<Database>,
    realtime: RealtimeBus,
  ) {
    this.db = db;
    this.realtime = realtime;
    this.characters = new CharacterService(db);
  }

  async getStatus(
    actorId: string,
    proposalId: string,
  ): Promise<{ status: AiProposalStatus }> {
    const proposal = await this.db
      .selectFrom("ai_proposals")
      .select("status")
      .where("id", "=", proposalId)
      .where("user_id", "=", actorId)
      .executeTakeFirst();
    if (!proposal) throw proposalNotFound();
    return { status: proposal.status };
  }

  async reject(actorId: string, proposalId: string): Promise<{ ok: true }> {
    const result = await this.db
      .updateTable("ai_proposals")
      .set({ status: "rejected", updated_at: new Date() })
      .where("id", "=", proposalId)
      .where("user_id", "=", actorId)
      .where("status", "=", "pending")
      .executeTakeFirst();
    if (Number(result.numUpdatedRows) !== 1) throw proposalNotFound();
    return { ok: true };
  }

  async apply(
    actorId: string,
    characterId: string,
    proposalId: string,
    submittedItems: SubmittedProposalItem[],
  ): Promise<ApplyProposalResponse> {
    if (new Set(submittedItems.map((item) => item.itemId)).size !== submittedItems.length) {
      throw new AppError(
        "VALIDATION_FAILED",
        400,
        "A proposal item may only be submitted once.",
      );
    }
    const result = await this.db.transaction().execute(async (trx) => {
      const proposal = await trx
        .selectFrom("ai_proposals")
        .select(["character_id as characterId", "user_id as userId", "status"])
        .where("id", "=", proposalId)
        .forUpdate()
        .executeTakeFirst();
      if (
        !proposal ||
        proposal.characterId !== characterId ||
        proposal.userId !== actorId
      ) {
        throw proposalNotFound();
      }
      if (proposal.status !== "pending") {
        throw new AppError(
          "AI_PROPOSAL_NOT_PENDING",
          409,
          "This proposal is no longer pending.",
        );
      }
      const character = await this.characters.authorizeCharacter(
        actorId,
        characterId,
        "edit",
        trx,
      );
      await trx
        .selectFrom("characters")
        .select("id")
        .where("id", "=", characterId)
        .forUpdate()
        .executeTakeFirstOrThrow();

      const selectedIds = submittedItems.map((item) => item.itemId);
      const items = await trx
        .selectFrom("ai_proposal_items as item")
        .innerJoin("pdf_fields as field", "field.id", "item.field_id")
        .select([
          "item.id",
          "item.field_id as fieldId",
          "item.expected_version as expectedVersion",
          "field.kind",
          "field.options",
          "field.template_id as templateId",
          "field.is_enabled as enabled",
        ])
        .where("item.proposal_id", "=", proposalId)
        .where("item.id", "in", selectedIds)
        .forUpdate()
        .execute();
      if (items.length !== submittedItems.length) throw proposalNotFound();
      if (
        items.some(
          (item) => !item.enabled || item.templateId !== character.templateId,
        )
      ) {
        throw proposalNotFound();
      }

      const currentRows = await trx
        .selectFrom("character_values")
        .select(["field_id as fieldId", "version"])
        .where("character_id", "=", characterId)
        .where("field_id", "in", items.map((item) => item.fieldId).sort())
        .forUpdate()
        .execute();
      const currentVersions = new Map(
        currentRows.map((row) => [row.fieldId, row.version]),
      );
      const itemById = new Map(items.map((item) => [item.id, item]));
      const applied: AiAppliedChange[] = [];
      const conflicts: ApplyProposalResponse["conflicts"] = [];

      for (const submitted of submittedItems) {
        const item = itemById.get(submitted.itemId)!;
        const currentVersion = currentVersions.get(item.fieldId) ?? 0;
        if (currentVersion !== item.expectedVersion) {
          conflicts.push({
            itemId: item.id,
            fieldId: item.fieldId,
            reason: "version_conflict",
            currentVersion,
          });
          continue;
        }
        try {
          validateFieldValue(item, submitted.value);
        } catch (error) {
          if (!(error instanceof AppError) || error.code !== "FIELD_VALUE_INVALID") {
            throw error;
          }
          conflicts.push({
            itemId: item.id,
            fieldId: item.fieldId,
            reason: "invalid_value",
            currentVersion,
          });
          continue;
        }

        const version = currentVersion + 1;
        const updatedAt = new Date();
        await trx
          .insertInto("character_values")
          .values({
            character_id: characterId,
            field_id: item.fieldId,
            value: JSON.stringify(submitted.value),
            version,
            updated_by: actorId,
            updated_at: updatedAt,
          })
          .onConflict((conflict) =>
            conflict.columns(["character_id", "field_id"]).doUpdateSet({
              value: JSON.stringify(submitted.value),
              version,
              updated_by: actorId,
              updated_at: updatedAt,
            }),
          )
          .execute();
        const character = await trx
          .updateTable("characters")
          .set({ revision: sql`revision + 1`, updated_at: updatedAt })
          .where("id", "=", characterId)
          .returning("revision")
          .executeTakeFirstOrThrow();
        currentVersions.set(item.fieldId, version);
        applied.push({
          itemId: item.id,
          fieldId: item.fieldId,
          value: submitted.value,
          version,
          revision: safeRevision(character.revision),
          updatedBy: actorId,
        });
      }

      await trx
        .updateTable("ai_proposals")
        .set({
          status: conflicts.length === 0 ? "applied" : "pending",
          updated_at: new Date(),
        })
        .where("id", "=", proposalId)
        .execute();
      return { applied, conflicts };
    });

    const updatedAt = new Date().toISOString();
    for (const change of result.applied) {
      this.realtime.publish({
        protocolVersion: 1,
        type: "field.changed",
        characterId,
        fieldId: change.fieldId,
        value: change.value,
        version: change.version,
        revision: change.revision,
        updatedAt,
        updatedBy: change.updatedBy,
      });
    }
    return result;
  }
}

function safeRevision(value: string): number {
  const revision = Number(value);
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new AppError("REVISION_OVERFLOW", 500, "Character revision is too large.");
  }
  return revision;
}

function proposalNotFound() {
  return new AppError("NOT_FOUND", 404, "Proposal not found.");
}
