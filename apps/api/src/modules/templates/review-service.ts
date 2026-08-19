import type {
  CreateReviewRequest,
  ListTemplateReviewsResponse,
  TemplateReview,
  UpdateTemplateMetadataRequest,
} from "@mycharacter/contracts";
import type { Database } from "@mycharacter/database";
import { sql, type Kysely } from "kysely";
import { AppError } from "../../errors.js";
import type { Actor } from "../../plugins/auth.js";
import { UserModerationService } from "../moderation/user-moderation-service.js";
import { NotificationService } from "../notifications/service.js";

export class TemplateReviewService {
  private readonly db: Kysely<Database>;

  constructor(database: Kysely<Database>) {
    this.db = database;
  }

  private async recalculateRating(templateId: string): Promise<void> {
    const stats = await this.db
      .selectFrom("template_reviews")
      .select([
        sql<number>`count(*)::int`.as("count"),
        sql<number>`coalesce(avg(rating), 0)::numeric(3, 2)`.as("avg"),
      ])
      .where("template_id", "=", templateId)
      .executeTakeFirst();

    await this.db
      .updateTable("pdf_templates")
      .set({
        rating_count: stats?.count ?? 0,
        rating_average: Number(stats?.avg ?? 0),
      })
      .where("id", "=", templateId)
      .execute();
  }

  async addOrUpdateReview(
    userId: string,
    templateId: string,
    input: CreateReviewRequest,
  ): Promise<TemplateReview> {
    await new UserModerationService(this.db).assertCanPost(userId);

    const template = await this.db
      .selectFrom("pdf_templates")
      .select(["id", "owner_id as ownerId", "title", "slug"])
      .where("id", "=", templateId)
      .where("deleted_at", "is", null)
      .executeTakeFirst();

    if (!template) {
      throw new AppError("TEMPLATE_NOT_FOUND", 404, "Template not found.");
    }

    const row = await this.db
      .insertInto("template_reviews")
      .values({
        template_id: templateId,
        user_id: userId,
        rating: input.rating,
        title: input.title?.trim() || null,
        body: input.body?.trim() || null,
        updated_at: new Date(),
      })
      .onConflict((oc) =>
        oc.columns(["template_id", "user_id"]).doUpdateSet({
          rating: input.rating,
          title: input.title?.trim() || null,
          body: input.body?.trim() || null,
          updated_at: new Date(),
        }),
      )
      .returning("id")
      .executeTakeFirstOrThrow();

    await this.recalculateRating(templateId);

    if (template.ownerId && template.ownerId !== userId) {
      await new NotificationService(this.db).notify({
        userId: template.ownerId,
        actorId: userId,
        type: "template_review",
        targetType: "template",
        targetId: templateId,
        title: "New review on your rule system",
        body: `Rated ${input.rating}/5 stars`,
        metadata: { templateId, rating: input.rating, slug: template.slug },
      });
    }

    const saved = await this.reviewQuery()
      .where("r.id", "=", row.id)
      .executeTakeFirstOrThrow();
    return toTemplateReview(saved);
  }

  // Selecting the saved review by id keeps an update to a review that already
  // fell outside the 50-row listing window from returning undefined.
  private reviewQuery() {
    return this.db
      .selectFrom("template_reviews as r")
      .innerJoin("profiles as author", "author.id", "r.user_id")
      .select([
        "r.id",
        "r.template_id as templateId",
        "r.user_id as userId",
        "author.username as authorUsername",
        "author.display_name as authorDisplayName",
        "r.rating",
        "r.title",
        "r.body",
        "r.created_at as createdAt",
        "r.updated_at as updatedAt",
      ]);
  }

  async listReviews(templateId: string): Promise<ListTemplateReviewsResponse> {
    const template = await this.db
      .selectFrom("pdf_templates")
      .select(["rating_average as ratingAvg", "rating_count as ratingCount"])
      .where("id", "=", templateId)
      .executeTakeFirst();

    const rows = await this.reviewQuery()
      .where("r.template_id", "=", templateId)
      .orderBy("r.created_at", "desc")
      .limit(50)
      .execute();

    return {
      reviews: rows.map(toTemplateReview),
      ratingAverage: Number(template?.ratingAvg ?? 0),
      ratingCount: template?.ratingCount ?? 0,
    };
  }

  async deleteReview(
    actor: Actor,
    templateId: string,
    reviewId: string,
  ): Promise<void> {
    const review = await this.db
      .selectFrom("template_reviews")
      .select(["user_id as userId"])
      .where("id", "=", reviewId)
      .executeTakeFirst();

    if (!review) {
      throw new AppError("REVIEW_NOT_FOUND", 404, "Review not found.");
    }

    const isModOrAdmin = actor.isAdmin || actor.role === "moderator";
    if (review.userId !== actor.userId && !isModOrAdmin) {
      throw new AppError("FORBIDDEN", 403, "You cannot delete this review.");
    }

    await this.db
      .deleteFrom("template_reviews")
      .where("id", "=", reviewId)
      .execute();

    await this.recalculateRating(templateId);
  }

  async updateMetadata(
    actor: Actor,
    templateId: string,
    input: UpdateTemplateMetadataRequest,
  ): Promise<void> {
    const template = await this.db
      .selectFrom("pdf_templates")
      .select(["owner_id as ownerId"])
      .where("id", "=", templateId)
      .executeTakeFirst();

    if (!template) {
      throw new AppError("TEMPLATE_NOT_FOUND", 404, "Template not found.");
    }

    if (template.ownerId !== actor.userId && !actor.isAdmin) {
      throw new AppError("FORBIDDEN", 403, "You cannot edit this system.");
    }

    const updates: Record<string, unknown> = {};
    if (input.tags !== undefined) {
      updates.tags = input.tags;
    }
    if (input.genre !== undefined) {
      updates.genre = input.genre;
    }
    if (input.complexity !== undefined) {
      updates.complexity = input.complexity;
    }

    if (Object.keys(updates).length > 0) {
      await this.db
        .updateTable("pdf_templates")
        .set(updates)
        .where("id", "=", templateId)
        .execute();
    }
  }
}

interface TemplateReviewRow {
  id: string;
  templateId: string;
  userId: string;
  authorUsername: string;
  authorDisplayName: string | null;
  rating: number;
  title: string | null;
  body: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toTemplateReview(row: TemplateReviewRow): TemplateReview {
  return {
    id: row.id,
    templateId: row.templateId,
    userId: row.userId,
    authorUsername: row.authorUsername,
    authorDisplayName: row.authorDisplayName,
    rating: row.rating,
    title: row.title,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
