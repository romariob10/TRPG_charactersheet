import type {
  ContentReport,
  CreateContentReportRequest,
  ListContentReportsQuery,
  ResolveReportRequest,
} from "@mycharacter/contracts";
import type { Database } from "@mycharacter/database";
import { sql, type Kysely } from "kysely";
import { AppError } from "../../errors.js";
import type { Actor } from "../../plugins/auth.js";
import { AuditService } from "../audit/service.js";

export class ModerationService {
  private readonly db: Kysely<Database>;
  private readonly audit: AuditService;

  constructor(database: Kysely<Database>) {
    this.db = database;
    this.audit = new AuditService(database);
  }

  async createReport(
    reporterId: string,
    input: CreateContentReportRequest,
  ): Promise<{ id: string; status: string }> {
    // Prevent duplicate spam reporting for same target within 24h
    const existing = await this.db
      .selectFrom("content_reports")
      .select("id")
      .where("reporter_id", "=", reporterId)
      .where("target_type", "=", input.targetType)
      .where("target_id", "=", input.targetId)
      .where("created_at", ">=", new Date(Date.now() - 24 * 60 * 60 * 1000))
      .executeTakeFirst();

    if (existing) {
      throw new AppError(
        "DUPLICATE_REPORT",
        429,
        "You have already reported this content recently.",
      );
    }

    const inserted = await this.db
      .insertInto("content_reports")
      .values({
        reporter_id: reporterId,
        target_type: input.targetType,
        target_id: input.targetId,
        reason: input.reason,
        details: input.details ?? null,
        status: "pending",
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    return { id: String(inserted.id), status: "pending" };
  }

  async listReports(
    query: ListContentReportsQuery,
  ): Promise<{ reports: ContentReport[]; nextCursor: string | null; totalPending: number }> {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);

    let baseQuery = this.db
      .selectFrom("content_reports as report")
      .leftJoin("profiles as reporter", "reporter.id", "report.reporter_id")
      .leftJoin("profiles as moderator", "moderator.id", "report.moderator_id")
      .select([
        "report.id",
        "report.reporter_id as reporterId",
        "reporter.username as reporterUsername",
        "report.target_type as targetType",
        "report.target_id as targetId",
        "report.reason",
        "report.details",
        "report.status",
        "report.moderator_id as moderatorId",
        "moderator.username as moderatorUsername",
        "report.resolution_note as resolutionNote",
        "report.created_at as createdAt",
        "report.resolved_at as resolvedAt",
      ])
      .orderBy("report.created_at", "desc")
      .limit(limit + 1);

    if (query.status && query.status !== "all") {
      baseQuery = baseQuery.where("report.status", "=", query.status);
    }
    if (query.targetType) {
      baseQuery = baseQuery.where("report.target_type", "=", query.targetType);
    }
    if (query.cursor) {
      baseQuery = baseQuery.where("report.created_at", "<", new Date(query.cursor));
    }

    const [rows, pendingCount] = await Promise.all([
      baseQuery.execute(),
      this.db
        .selectFrom("content_reports")
        .select(sql<number>`count(*)::int`.as("count"))
        .where("status", "=", "pending")
        .executeTakeFirst(),
    ]);

    const hasNext = rows.length > limit;
    const items = hasNext ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasNext && items.length > 0
        ? items[items.length - 1].createdAt.toISOString()
        : null;

    const reports: ContentReport[] = items.map((r) => ({
      id: String(r.id),
      reporterId: r.reporterId ? String(r.reporterId) : null,
      reporterUsername: r.reporterUsername ?? null,
      targetType: r.targetType as any,
      targetId: r.targetId,
      reason: r.reason,
      details: r.details,
      status: r.status as any,
      moderatorId: r.moderatorId ? String(r.moderatorId) : null,
      moderatorUsername: r.moderatorUsername ?? null,
      resolutionNote: r.resolutionNote,
      createdAt: r.createdAt.toISOString(),
      resolvedAt: r.resolvedAt ? new Date(r.resolvedAt).toISOString() : null,
    }));

    return {
      reports,
      nextCursor,
      totalPending: pendingCount?.count ?? 0,
    };
  }

  async resolveReport(
    moderator: Actor,
    reportId: string,
    input: ResolveReportRequest,
  ): Promise<{ success: boolean }> {
    const report = await this.db
      .selectFrom("content_reports")
      .selectAll()
      .where("id", "=", reportId as any)
      .executeTakeFirst();

    if (!report) {
      throw new AppError("REPORT_NOT_FOUND", 404, "Report not found.");
    }

    await this.db
      .updateTable("content_reports")
      .set({
        status: input.status,
        resolution_note: input.resolutionNote ?? null,
        moderator_id: moderator.userId,
        resolved_at: new Date(),
      })
      .where("id", "=", reportId as any)
      .execute();

    if (input.actionTaken === "delete_content") {
      if (report.target_type === "post") {
        await this.db.deleteFrom("posts").where("id", "=", report.target_id).execute();
      } else if (report.target_type === "comment") {
        await this.db.deleteFrom("post_comments").where("id", "=", report.target_id).execute();
        await this.db.deleteFrom("template_comments").where("id", "=", report.target_id).execute();
      } else if (report.target_type === "character") {
        await this.db.updateTable("characters").set({ status: "trashed" }).where("id", "=", report.target_id).execute();
      } else if (report.target_type === "template") {
        await this.db.updateTable("pdf_templates").set({ deleted_at: new Date() }).where("id", "=", report.target_id).execute();
      }
    }

    await this.audit.log({
      actorId: moderator.userId,
      actorRole: moderator.role,
      action: `resolve_report_${input.status}`,
      targetType: report.target_type,
      targetId: report.target_id,
      reason: input.resolutionNote,
      metadata: {
        reportId,
        actionTaken: input.actionTaken ?? "none",
        originalReason: report.reason,
      },
    });

    return { success: true };
  }
}
