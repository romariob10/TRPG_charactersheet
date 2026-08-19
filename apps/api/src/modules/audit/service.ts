import type {
  AdminAuditEvent,
  ListAdminAuditEventsQuery,
} from "@mycharacter/contracts";
import type { Database } from "@mycharacter/database";
import type { Kysely } from "kysely";

const MAX_METADATA_BYTES = 16 * 1024;
const SENSITIVE_KEYS = new Set([
  "password",
  "password_hash",
  "token",
  "apikey",
  "api_key",
  "secret",
  "cookie",
  "session",
]);

export interface LogAuditEventInput {
  actorId: string | null;
  actorRole: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
  requestId?: string | null;
}

export class AuditService {
  private readonly db: Kysely<Database>;

  constructor(database: Kysely<Database>) {
    this.db = database;
  }

  async log(input: LogAuditEventInput): Promise<void> {
    const sanitizedMetadata = this.sanitizeMetadata(input.metadata ?? {});

    await this.db
      .insertInto("admin_audit_events")
      .values({
        actor_id: input.actorId,
        actor_role: input.actorRole,
        action: input.action,
        target_type: input.targetType,
        target_id: input.targetId ?? null,
        reason: input.reason ?? null,
        metadata: JSON.stringify(sanitizedMetadata),
        request_id: input.requestId ?? null,
      })
      .execute();
  }

  async list(
    query: ListAdminAuditEventsQuery,
    allowedTargetTypes?: string[],
  ): Promise<{ events: AdminAuditEvent[]; nextCursor: string | null }> {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);

    let dbQuery = this.db
      .selectFrom("admin_audit_events as event")
      .leftJoin("profiles as actor_profile", "actor_profile.id", "event.actor_id")
      .select([
        "event.id",
        "event.actor_id as actorId",
        "event.actor_role as actorRole",
        "actor_profile.username as actorUsername",
        "event.action",
        "event.target_type as targetType",
        "event.target_id as targetId",
        "event.reason",
        "event.metadata",
        "event.request_id as requestId",
        "event.created_at as createdAt",
      ])
      .orderBy("event.created_at", "desc")
      .limit(limit + 1);

    if (query.cursor) {
      dbQuery = dbQuery.where("event.created_at", "<", new Date(query.cursor));
    }
    if (query.actorId) {
      dbQuery = dbQuery.where("event.actor_id", "=", query.actorId);
    }
    if (query.action) {
      dbQuery = dbQuery.where("event.action", "=", query.action);
    }
    if (query.targetType) {
      dbQuery = dbQuery.where("event.target_type", "=", query.targetType);
    } else if (allowedTargetTypes && allowedTargetTypes.length > 0) {
      dbQuery = dbQuery.where("event.target_type", "in", allowedTargetTypes);
    }
    if (query.targetId) {
      dbQuery = dbQuery.where("event.target_id", "=", query.targetId);
    }

    const rows = await dbQuery.execute();
    const hasNext = rows.length > limit;
    const items = hasNext ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasNext && items.length > 0
        ? items[items.length - 1].createdAt.toISOString()
        : null;

    const events: AdminAuditEvent[] = items.map((row) => ({
      id: String(row.id),
      actorId: row.actorId ? String(row.actorId) : null,
      actorRole: row.actorRole,
      actorUsername: row.actorUsername ?? null,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId ? String(row.targetId) : null,
      reason: row.reason,
      metadata:
        typeof row.metadata === "string"
          ? JSON.parse(row.metadata)
          : ((row.metadata as Record<string, unknown>) ?? {}),
      requestId: row.requestId,
      createdAt: row.createdAt.toISOString(),
    }));

    return { events, nextCursor };
  }

  private sanitizeMetadata(
    metadata: Record<string, unknown>,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        result[key] = "[REDACTED]";
      } else if (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
      ) {
        result[key] = this.sanitizeMetadata(value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }
    const serialized = JSON.stringify(result);
    if (Buffer.byteLength(serialized, "utf-8") > MAX_METADATA_BYTES) {
      return { _truncated: true, summary: "Metadata exceeds maximum size." };
    }
    return result;
  }
}
