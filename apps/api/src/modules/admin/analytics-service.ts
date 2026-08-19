import type {
  AnalyticsPeriod,
  AnalyticsSummary,
  TimeSeriesPoint,
} from "@mycharacter/contracts";
import type { Database } from "@mycharacter/database";
import { sql, type Kysely } from "kysely";

export class AnalyticsService {
  private readonly db: Kysely<Database>;

  constructor(database: Kysely<Database>) {
    this.db = database;
  }

  async getSummary(period: AnalyticsPeriod = "30d"): Promise<AnalyticsSummary> {
    const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
    const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [
      totalUsersRow,
      newUsersRow,
      totalPostsRow,
      newPostsRow,
      totalCharsRow,
      newCharsRow,
      totalTemplatesRow,
      totalCommentsRow,
      totalReactionsRow,
      totalReportsRow,
      pendingReportsRow,
      userGrowthRows,
      postVelocityRows,
    ] = await Promise.all([
      this.db.selectFrom("users").select(sql<number>`count(*)::int`.as("count")).executeTakeFirst(),
      this.db.selectFrom("users").select(sql<number>`count(*)::int`.as("count")).where("created_at", ">=", sinceDate).executeTakeFirst(),
      this.db.selectFrom("posts").select(sql<number>`count(*)::int`.as("count")).executeTakeFirst(),
      this.db.selectFrom("posts").select(sql<number>`count(*)::int`.as("count")).where("created_at", ">=", sinceDate).executeTakeFirst(),
      this.db.selectFrom("characters").select(sql<number>`count(*)::int`.as("count")).executeTakeFirst(),
      this.db.selectFrom("characters").select(sql<number>`count(*)::int`.as("count")).where("created_at", ">=", sinceDate).executeTakeFirst(),
      this.db.selectFrom("pdf_templates").select(sql<number>`count(*)::int`.as("count")).executeTakeFirst(),
      this.db.selectFrom("post_comments").select(sql<number>`count(*)::int`.as("count")).executeTakeFirst(),
      this.db.selectFrom("post_reactions").select(sql<number>`count(*)::int`.as("count")).executeTakeFirst(),
      this.db.selectFrom("content_reports").select(sql<number>`count(*)::int`.as("count")).executeTakeFirst(),
      this.db.selectFrom("content_reports").select(sql<number>`count(*)::int`.as("count")).where("status", "=", "pending").executeTakeFirst(),
      this.db
        .selectFrom("users")
        .select([
          sql<string>`to_char(date_trunc('day', created_at), 'YYYY-MM-DD')`.as("date"),
          sql<number>`count(*)::int`.as("count"),
        ])
        .where("created_at", ">=", sinceDate)
        .groupBy(sql`date_trunc('day', created_at)`)
        .orderBy(sql`date_trunc('day', created_at)`, "asc")
        .execute(),
      this.db
        .selectFrom("posts")
        .select([
          sql<string>`to_char(date_trunc('day', created_at), 'YYYY-MM-DD')`.as("date"),
          sql<number>`count(*)::int`.as("count"),
        ])
        .where("created_at", ">=", sinceDate)
        .groupBy(sql`date_trunc('day', created_at)`)
        .orderBy(sql`date_trunc('day', created_at)`, "asc")
        .execute(),
    ]);

    const userGrowth: TimeSeriesPoint[] = userGrowthRows.map((r) => ({
      date: r.date,
      count: r.count,
    }));

    const postVelocity: TimeSeriesPoint[] = postVelocityRows.map((r) => ({
      date: r.date,
      count: r.count,
    }));

    return {
      period,
      totalUsers: totalUsersRow?.count ?? 0,
      newUsers: newUsersRow?.count ?? 0,
      totalPosts: totalPostsRow?.count ?? 0,
      newPosts: newPostsRow?.count ?? 0,
      totalCharacters: totalCharsRow?.count ?? 0,
      newCharacters: newCharsRow?.count ?? 0,
      totalTemplates: totalTemplatesRow?.count ?? 0,
      totalComments: totalCommentsRow?.count ?? 0,
      totalReactions: totalReactionsRow?.count ?? 0,
      totalReports: totalReportsRow?.count ?? 0,
      pendingReports: pendingReportsRow?.count ?? 0,
      userGrowth,
      postVelocity,
    };
  }
}
