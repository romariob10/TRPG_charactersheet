import { createHash, randomBytes } from "node:crypto";
import {
  agentPresenceRequestSchema,
  type AgentResource,
  type AgentPresenceRequest,
  type CreateAgentTokenRequest,
} from "@mycharacter/contracts";
import type { Database } from "@mycharacter/database";
import { sql, type Kysely } from "kysely";
import { AppError } from "../../errors.js";
import { CharacterService } from "../characters/service.js";
import { SheetBuilderService } from "../sheet-builder/service.js";

export function hashAgentToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export class AgentService {
  private readonly db: Kysely<Database>;

  constructor(db: Kysely<Database>) {
    this.db = db;
  }

  async list(userId: string) {
    const rows = await this.db
      .selectFrom("agent_tokens")
      .select([
        "id",
        "name",
        "prefix",
        "created_at",
        "expires_at",
        "last_used_at",
      ])
      .where("user_id", "=", userId)
      .where("expires_at", ">", new Date())
      .orderBy("created_at", "desc")
      .execute();
    return { tokens: rows.map(metadata) };
  }

  async create(userId: string, input: CreateAgentTokenRequest) {
    const token = `mcp_${randomBytes(32).toString("base64url")}`;
    const row = await this.db
      .insertInto("agent_tokens")
      .values({
        user_id: userId,
        name: input.name,
        prefix: token.slice(0, 12),
        token_hash: hashAgentToken(token),
        expires_at: new Date(Date.now() + input.expiresInDays * 86_400_000),
      })
      .returning([
        "id",
        "name",
        "prefix",
        "created_at",
        "expires_at",
        "last_used_at",
      ])
      .executeTakeFirstOrThrow();
    return { token, metadata: metadata(row) };
  }

  async revoke(userId: string, id: string) {
    await this.db
      .deleteFrom("agent_tokens")
      .where("user_id", "=", userId)
      .where("id", "=", id)
      .execute();
  }

  async assertAccess(userId: string, resource: AgentResource) {
    if (resource.resourceType === "character") {
      await new CharacterService(this.db).get(userId, resource.resourceId);
    } else {
      await new SheetBuilderService(this.db).getSheetEditorData(
        userId,
        resource.resourceId,
      );
    }
  }

  async presence(userId: string, resource: AgentResource) {
    await this.assertAccess(userId, resource);
    const rows = await this.db
      .selectFrom("agent_tokens")
      .innerJoin("users", "users.id", "agent_tokens.user_id")
      .select([
        "agent_tokens.id",
        "agent_tokens.user_id",
        "agent_tokens.name",
        "presence",
        "presence_at",
      ])
      .where("expires_at", ">", new Date())
      .where(sql<string>`presence->>'resourceId'`, "=", resource.resourceId)
      .where(sql<string>`presence->>'resourceType'`, "=", resource.resourceType)
      .where("users.status", "=", "active")
      .where("presence_at", ">", new Date(Date.now() - 30_000))
      .execute();
    const agents = [];
    for (const row of rows) {
      const parsed = agentPresenceRequestSchema.safeParse(row.presence);
      if (
        !parsed.success ||
        parsed.data.resourceId !== resource.resourceId ||
        parsed.data.resourceType !== resource.resourceType
      )
        continue;
      // Access can be revoked while an agent is connected.
      try {
        await this.assertAccess(row.user_id, resource);
      } catch (error) {
        if (error instanceof AppError && [403, 404].includes(error.statusCode))
          continue;
        throw error;
      }
      agents.push({
        ...parsed.data,
        id: row.id,
        name: row.name,
        updatedAt: row.presence_at!.toISOString(),
      });
    }
    return { agents };
  }

  async updatePresence(
    userId: string,
    tokenId: string,
    presence: AgentPresenceRequest | null,
  ) {
    if (presence) await this.assertAccess(userId, presence);
    await this.db
      .updateTable("agent_tokens")
      .set({
        presence: presence ? JSON.stringify(presence) : null,
        presence_at: presence ? new Date() : null,
      })
      .where("id", "=", tokenId)
      .where("user_id", "=", userId)
      .execute();
  }
}

function metadata(row: {
  id: string;
  name: string;
  prefix: string;
  created_at: Date;
  expires_at: Date;
  last_used_at: Date | null;
}) {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    lastUsedAt: row.last_used_at?.toISOString() ?? null,
  };
}
