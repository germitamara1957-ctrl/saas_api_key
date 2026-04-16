import { Router, type IRouter } from "express";
import { eq, sum, count, gte, inArray, and, sql } from "drizzle-orm";
import { db, usersTable, apiKeysTable, usageLogsTable, plansTable } from "@workspace/db";
import { generateApiKey, encryptApiKey } from "../../lib/crypto";

const router: IRouter = Router();

router.get("/portal/me", async (req, res): Promise<void> => {
  const userId = Number(req.authUser!.sub);

  const [user] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      role: usersTable.role,
      isActive: usersTable.isActive,
      creditBalance: usersTable.creditBalance,
      emailVerified: usersTable.emailVerified,
      createdAt: usersTable.createdAt,
      updatedAt: usersTable.updatedAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const userKeys = await db
    .select({ id: apiKeysTable.id })
    .from(apiKeysTable)
    .where(eq(apiKeysTable.userId, userId));

  const keyIds = userKeys.map((k) => k.id);

  const balanceResult = [{ total: user?.creditBalance ?? 0 }];

  let monthlyStats = { totalRequests: 0, totalTokens: 0 };
  if (keyIds.length > 0) {
    const statsResult = await db
      .select({
        totalRequests: count(),
        totalTokens: sum(usageLogsTable.totalTokens),
      })
      .from(usageLogsTable)
      .where(
        and(
          inArray(usageLogsTable.apiKeyId, keyIds),
          gte(usageLogsTable.createdAt, startOfMonth),
        ),
      );

    monthlyStats.totalRequests = Number(statsResult[0]?.totalRequests ?? 0);
    monthlyStats.totalTokens = Number(statsResult[0]?.totalTokens ?? 0);
  }

  res.json({
    user,
    totalCreditsBalance: Number(balanceResult[0]?.total ?? 0),
    totalRequestsThisMonth: monthlyStats.totalRequests,
    totalTokensThisMonth: monthlyStats.totalTokens,
  });
});

router.get("/portal/api-keys", async (req, res): Promise<void> => {
  const userId = Number(req.authUser!.sub);

  const keys = await db
    .select({
      id: apiKeysTable.id,
      userId: apiKeysTable.userId,
      planId: apiKeysTable.planId,
      keyPrefix: apiKeysTable.keyPrefix,
      name: apiKeysTable.name,
      creditBalance: apiKeysTable.creditBalance,
      isActive: apiKeysTable.isActive,
      lastUsedAt: apiKeysTable.lastUsedAt,
      revokedAt: apiKeysTable.revokedAt,
      createdAt: apiKeysTable.createdAt,
      updatedAt: apiKeysTable.updatedAt,
    })
    .from(apiKeysTable)
    .where(eq(apiKeysTable.userId, userId))
    .orderBy(apiKeysTable.createdAt);

  res.json(keys);
});

router.post("/portal/api-keys", async (req, res): Promise<void> => {
  const userId = Number(req.authUser!.sub);

  const rawName = req.body?.name;
  if (rawName !== undefined && (typeof rawName !== "string" || rawName.length > 100)) {
    res.status(400).json({ error: "name must be a string of at most 100 characters" });
    return;
  }
  const keyName: string | null = typeof rawName === "string" && rawName.trim() ? rawName.trim() : null;

  const rawPlanId = req.body?.planId;
  let assignedPlanId: number | null = null;
  let initialCredits = 0;

  if (rawPlanId !== undefined) {
    const planIdNum = Number(rawPlanId);
    if (!Number.isInteger(planIdNum) || planIdNum <= 0) {
      res.status(400).json({ error: "Invalid planId" });
      return;
    }
    const [plan] = await db.select().from(plansTable)
      .where(and(eq(plansTable.id, planIdNum), eq(plansTable.isActive, true))).limit(1);
    if (!plan) {
      res.status(404).json({ error: "Plan not found" });
      return;
    }
    if (plan.priceUsd > 0) {
      res.status(403).json({ error: "Paid plans require administrator approval. Please contact support." });
      return;
    }
    assignedPlanId = plan.id;
    // Only grant initial credits if the user has never had a key on this plan before
    // (prevents revoking and re-creating keys to farm free credits)
    const [priorKey] = await db.select({ id: apiKeysTable.id })
      .from(apiKeysTable)
      .where(and(eq(apiKeysTable.userId, userId), eq(apiKeysTable.planId, plan.id)))
      .limit(1);
    if (!priorKey) {
      initialCredits = plan.monthlyCredits;
    }
  }

  const [user] = await db.select({ id: usersTable.id, isActive: usersTable.isActive })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  if (!user || !user.isActive) {
    res.status(403).json({ error: "Account is not active" });
    return;
  }

  const existingKeys = await db.select({ id: apiKeysTable.id, planId: apiKeysTable.planId })
    .from(apiKeysTable)
    .where(and(eq(apiKeysTable.userId, userId), eq(apiKeysTable.isActive, true)));

  let maxApiKeys = 1;
  if (existingKeys.length > 0) {
    const planIds = [...new Set(existingKeys.map(k => k.planId).filter((p): p is number => p !== null))];
    if (planIds.length > 0) {
      const [plan] = await db.select({ maxApiKeys: plansTable.maxApiKeys })
        .from(plansTable).where(eq(plansTable.id, planIds[0]!)).limit(1);
      if (plan) maxApiKeys = plan.maxApiKeys;
    }
  }

  if (existingKeys.length >= maxApiKeys) {
    res.status(403).json({
      error: `Your plan allows a maximum of ${maxApiKeys} active API key${maxApiKeys === 1 ? "" : "s"}. Contact your administrator to upgrade.`,
    });
    return;
  }

  const { rawKey, keyHash, keyPrefix } = generateApiKey();
  const keyEncrypted = encryptApiKey(rawKey);

  const apiKey = await db.transaction(async (tx) => {
    const [key] = await tx.insert(apiKeysTable).values({
      userId,
      planId: assignedPlanId,
      keyPrefix,
      keyHash,
      keyEncrypted,
      name: keyName ?? (assignedPlanId ? "Free Plan Key" : "Default Key"),
      isActive: true,
    }).returning();

    if (initialCredits > 0) {
      await tx.update(usersTable)
        .set({ creditBalance: sql`credit_balance + ${initialCredits}` })
        .where(eq(usersTable.id, userId));
    }

    return key!;
  });

  res.status(201).json({
    id: apiKey.id,
    keyPrefix: apiKey.keyPrefix,
    fullKey: rawKey,
    name: apiKey.name,
    isActive: apiKey.isActive,
    createdAt: apiKey.createdAt,
  });
});

router.delete("/portal/api-keys/:id", async (req, res): Promise<void> => {
  const userId = Number(req.authUser!.sub);
  const keyId = Number(req.params.id);

  if (!Number.isInteger(keyId) || keyId <= 0) {
    res.status(400).json({ error: "Invalid key ID" });
    return;
  }

  const [key] = await db.select({ id: apiKeysTable.id, userId: apiKeysTable.userId })
    .from(apiKeysTable)
    .where(and(eq(apiKeysTable.id, keyId), eq(apiKeysTable.userId, userId)))
    .limit(1);

  if (!key) {
    res.status(404).json({ error: "API key not found" });
    return;
  }

  await db.update(apiKeysTable)
    .set({ isActive: false })
    .where(eq(apiKeysTable.id, keyId));

  res.json({ success: true });
});

router.get("/portal/plans", async (_req, res): Promise<void> => {
  const plans = await db
    .select()
    .from(plansTable)
    .where(eq(plansTable.isActive, true))
    .orderBy(plansTable.id);

  res.json(plans);
});

router.post("/portal/plans/:planId/enroll", async (req, res): Promise<void> => {
  const userId = Number(req.authUser!.sub);
  const planId = Number(req.params.planId);

  if (!Number.isInteger(planId) || planId <= 0) {
    res.status(400).json({ error: "Invalid planId" });
    return;
  }

  const [plan] = await db.select().from(plansTable)
    .where(and(eq(plansTable.id, planId), eq(plansTable.isActive, true))).limit(1);

  if (!plan) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }
  if (plan.priceUsd > 0) {
    res.status(403).json({ error: "Paid plans require administrator approval." });
    return;
  }

  const [user] = await db.select({ id: usersTable.id, isActive: usersTable.isActive })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user || !user.isActive) {
    res.status(403).json({ error: "Account is not active" });
    return;
  }

  const existingKeys = await db.select()
    .from(apiKeysTable)
    .where(and(eq(apiKeysTable.userId, userId), eq(apiKeysTable.isActive, true)))
    .limit(10);

  const planlessKey = existingKeys.find(k => k.planId === null);

  if (planlessKey) {
    await db.transaction(async (tx) => {
      await tx.update(apiKeysTable)
        .set({ planId: plan.id })
        .where(eq(apiKeysTable.id, planlessKey.id));

      if (plan.monthlyCredits > 0) {
        await tx.update(usersTable)
          .set({ creditBalance: sql`credit_balance + ${plan.monthlyCredits}` })
          .where(eq(usersTable.id, userId));
      }
    });

    res.json({
      enrolled: true,
      existing: true,
      keyPrefix: planlessKey.keyPrefix,
      planName: plan.name,
      creditsAdded: plan.monthlyCredits,
    });
    return;
  }

  const alreadyOnPlan = existingKeys.find(k => k.planId === planId);
  if (alreadyOnPlan) {
    res.status(409).json({ error: "You are already on this plan." });
    return;
  }

  const { rawKey, keyHash, keyPrefix } = generateApiKey();
  const keyEncrypted = encryptApiKey(rawKey);

  const newKey = await db.transaction(async (tx) => {
    const [key] = await tx.insert(apiKeysTable).values({
      userId,
      planId: plan.id,
      keyPrefix,
      keyHash,
      keyEncrypted,
      name: `${plan.name} Key`,
      isActive: true,
    }).returning();

    if (plan.monthlyCredits > 0) {
      await tx.update(usersTable)
        .set({ creditBalance: sql`credit_balance + ${plan.monthlyCredits}` })
        .where(eq(usersTable.id, userId));
    }

    return key!;
  });

  res.status(201).json({
    enrolled: true,
    existing: false,
    keyPrefix: newKey.keyPrefix,
    fullKey: rawKey,
    planName: plan.name,
    creditsAdded: plan.monthlyCredits,
  });
});

export default router;
