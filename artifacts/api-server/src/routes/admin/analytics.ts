import { Router, type IRouter } from "express";
import { eq, gte, lte, count, sum, and, inArray, sql } from "drizzle-orm";
import { db, usageLogsTable, apiKeysTable, usersTable } from "@workspace/db";
import { requireAdmin } from "../../middlewares/adminAuth";

const router: IRouter = Router();

router.get("/admin/analytics/stats", requireAdmin, async (req, res): Promise<void> => {
  const now = new Date();
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [todayStats, monthStats, activeKeys, activeUsers, topModelToday] = await Promise.all([
    db
      .select({
        totalRequests: count(),
        totalTokens: sum(usageLogsTable.totalTokens),
        totalCost: sum(usageLogsTable.costUsd),
      })
      .from(usageLogsTable)
      .where(gte(usageLogsTable.createdAt, startOfToday)),

    db
      .select({
        totalRequests: count(),
        totalTokens: sum(usageLogsTable.totalTokens),
        totalCost: sum(usageLogsTable.costUsd),
      })
      .from(usageLogsTable)
      .where(gte(usageLogsTable.createdAt, startOfMonth)),

    db.select({ count: count() }).from(apiKeysTable).where(eq(apiKeysTable.isActive, true)),

    db.select({ count: count() }).from(usersTable).where(eq(usersTable.isActive, true)),

    db
      .select({ model: usageLogsTable.model, requests: count() })
      .from(usageLogsTable)
      .where(gte(usageLogsTable.createdAt, startOfToday))
      .groupBy(usageLogsTable.model)
      .orderBy(sql`count(*) DESC`)
      .limit(1),
  ]);

  res.json({
    totalRequestsToday: Number(todayStats[0]?.totalRequests ?? 0),
    totalTokensToday: Number(todayStats[0]?.totalTokens ?? 0),
    totalCostTodayUsd: Number(todayStats[0]?.totalCost ?? 0),
    totalRequestsThisMonth: Number(monthStats[0]?.totalRequests ?? 0),
    totalTokensThisMonth: Number(monthStats[0]?.totalTokens ?? 0),
    totalCostThisMonthUsd: Number(monthStats[0]?.totalCost ?? 0),
    activeApiKeys: Number(activeKeys[0]?.count ?? 0),
    activeUsers: Number(activeUsers[0]?.count ?? 0),
    topModelToday: topModelToday[0]?.model ?? null,
  });
});

router.get("/admin/analytics/user-summary", requireAdmin, async (req, res): Promise<void> => {
  const rawUserId = req.query.userId;
  const userId = parseInt(rawUserId as string, 10);
  if (!rawUserId || isNaN(userId) || userId <= 0) {
    res.status(400).json({ error: "userId query param is required" });
    return;
  }

  const [userRow] = await db
    .select({ creditBalance: usersTable.creditBalance })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  const userKeys = await db
    .select({ id: apiKeysTable.id, isActive: apiKeysTable.isActive })
    .from(apiKeysTable)
    .where(eq(apiKeysTable.userId, userId));

  const activeKeys = userKeys.filter((k) => k.isActive);
  const totalCredits = Number(userRow?.creditBalance ?? 0);

  if (userKeys.length === 0) {
    res.json({
      totalCalls: 0,
      successCalls: 0,
      failedCalls: 0,
      totalSpend: 0,
      monthCalls: 0,
      monthSpend: 0,
      totalCreditsRemaining: totalCredits,
      activeKeyCount: 0,
      topModels: [],
      dailyUsage: [],
    });
    return;
  }

  const keyIds = userKeys.map((k) => k.id);
  const nowUtc = new Date();
  const startOfMonth = new Date(Date.UTC(nowUtc.getUTCFullYear(), nowUtc.getUTCMonth(), 1));
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [allTimeStats, monthStats, successCount, topModels, dailyUsage] = await Promise.all([
    db
      .select({ calls: count(), spend: sum(usageLogsTable.costUsd) })
      .from(usageLogsTable)
      .where(inArray(usageLogsTable.apiKeyId, keyIds)),

    db
      .select({ calls: count(), spend: sum(usageLogsTable.costUsd) })
      .from(usageLogsTable)
      .where(and(inArray(usageLogsTable.apiKeyId, keyIds), gte(usageLogsTable.createdAt, startOfMonth))),

    db
      .select({ calls: count() })
      .from(usageLogsTable)
      .where(and(inArray(usageLogsTable.apiKeyId, keyIds), eq(usageLogsTable.status, "success"))),

    db
      .select({
        model: usageLogsTable.model,
        calls: count(),
        spend: sum(usageLogsTable.costUsd),
      })
      .from(usageLogsTable)
      .where(inArray(usageLogsTable.apiKeyId, keyIds))
      .groupBy(usageLogsTable.model)
      .orderBy(sql`count(*) DESC`)
      .limit(6),

    db
      .select({
        date: sql<string>`DATE(created_at)`,
        calls: count(),
        spend: sum(usageLogsTable.costUsd),
      })
      .from(usageLogsTable)
      .where(and(inArray(usageLogsTable.apiKeyId, keyIds), gte(usageLogsTable.createdAt, sevenDaysAgo)))
      .groupBy(sql`DATE(created_at)`)
      .orderBy(sql`DATE(created_at) ASC`),
  ]);

  const totalCalls = Number(allTimeStats[0]?.calls ?? 0);
  const success = Number(successCount[0]?.calls ?? 0);

  res.json({
    totalCalls,
    successCalls: success,
    failedCalls: totalCalls - success,
    totalSpend: Number(allTimeStats[0]?.spend ?? 0),
    monthCalls: Number(monthStats[0]?.calls ?? 0),
    monthSpend: Number(monthStats[0]?.spend ?? 0),
    totalCreditsRemaining: totalCredits,
    activeKeyCount: activeKeys.length,
    topModels: topModels.map((m) => ({
      model: m.model,
      calls: Number(m.calls),
      spend: Number(m.spend ?? 0),
    })),
    dailyUsage: dailyUsage.map((d) => ({
      date: d.date as string,
      calls: Number(d.calls),
      spend: Number(d.spend ?? 0),
    })),
  });
});

// T5: Analytics usage with time range filter
router.get("/admin/analytics/usage", requireAdmin, async (req, res): Promise<void> => {
  const page = Math.max(1, parseInt(req.query.page as string || "1", 10));
  const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit as string || "50", 10)));
  const offset = (page - 1) * limit;
  const apiKeyId = req.query.apiKeyId ? parseInt(req.query.apiKeyId as string, 10) : undefined;
  const userId = req.query.userId ? parseInt(req.query.userId as string, 10) : undefined;
  const model = req.query.model as string | undefined;
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;

  const conditions = [];

  if (apiKeyId && !isNaN(apiKeyId)) {
    conditions.push(eq(usageLogsTable.apiKeyId, apiKeyId));
  } else if (userId && !isNaN(userId)) {
    const userKeys = await db
      .select({ id: apiKeysTable.id })
      .from(apiKeysTable)
      .where(eq(apiKeysTable.userId, userId));

    if (userKeys.length === 0) {
      res.json({ items: [], total: 0, page, limit });
      return;
    }

    conditions.push(inArray(usageLogsTable.apiKeyId, userKeys.map((k) => k.id)));
  }

  if (model) conditions.push(eq(usageLogsTable.model, model));

  if (from) {
    const fromDate = new Date(from);
    if (!isNaN(fromDate.getTime())) {
      conditions.push(gte(usageLogsTable.createdAt, fromDate));
    }
  }
  if (to) {
    const toDate = new Date(to);
    if (!isNaN(toDate.getTime())) {
      toDate.setHours(23, 59, 59, 999);
      conditions.push(lte(usageLogsTable.createdAt, toDate));
    }
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, totalResult] = await Promise.all([
    db
      .select()
      .from(usageLogsTable)
      .where(whereClause)
      .orderBy(usageLogsTable.createdAt)
      .limit(limit)
      .offset(offset),
    db.select({ count: count() }).from(usageLogsTable).where(whereClause),
  ]);

  res.json({ items, total: totalResult[0]?.count ?? 0, page, limit });
});

// T5: Aggregated time-series stats with range filter (for charts)
router.get("/admin/analytics/timeseries", requireAdmin, async (req, res): Promise<void> => {
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;

  const conditions = [];

  if (from) {
    const fromDate = new Date(from);
    if (!isNaN(fromDate.getTime())) {
      conditions.push(gte(usageLogsTable.createdAt, fromDate));
    }
  }
  if (to) {
    const toDate = new Date(to);
    if (!isNaN(toDate.getTime())) {
      toDate.setHours(23, 59, 59, 999);
      conditions.push(lte(usageLogsTable.createdAt, toDate));
    }
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [daily, byModel, totals] = await Promise.all([
    db
      .select({
        date: sql<string>`DATE(created_at)`,
        requests: count(),
        tokens: sum(usageLogsTable.totalTokens),
        cost: sum(usageLogsTable.costUsd),
      })
      .from(usageLogsTable)
      .where(whereClause)
      .groupBy(sql`DATE(created_at)`)
      .orderBy(sql`DATE(created_at) ASC`),

    db
      .select({
        model: usageLogsTable.model,
        requests: count(),
        cost: sum(usageLogsTable.costUsd),
      })
      .from(usageLogsTable)
      .where(whereClause)
      .groupBy(usageLogsTable.model)
      .orderBy(sql`count(*) DESC`)
      .limit(10),

    db
      .select({
        totalRequests: count(),
        totalTokens: sum(usageLogsTable.totalTokens),
        totalCost: sum(usageLogsTable.costUsd),
      })
      .from(usageLogsTable)
      .where(whereClause),
  ]);

  res.json({
    daily: daily.map((d) => ({
      date: d.date,
      requests: Number(d.requests),
      tokens: Number(d.tokens ?? 0),
      cost: Number(d.cost ?? 0),
    })),
    byModel: byModel.map((m) => ({
      model: m.model,
      requests: Number(m.requests),
      cost: Number(m.cost ?? 0),
    })),
    totals: {
      requests: Number(totals[0]?.totalRequests ?? 0),
      tokens: Number(totals[0]?.totalTokens ?? 0),
      cost: Number(totals[0]?.totalCost ?? 0),
    },
  });
});

export default router;
