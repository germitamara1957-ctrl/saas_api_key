import { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, apiKeysTable, plansTable, usersTable, type ApiKey, type Plan } from "@workspace/db";
import { hashApiKey } from "../lib/crypto";
import { sendEmail, buildLowCreditEmail } from "../lib/email";
import { logger } from "../lib/logger";

declare global {
  namespace Express {
    interface Request {
      apiKey?: ApiKey & { plan: Plan; accountCreditBalance: number };
    }
  }
}

const LOW_CREDIT_THRESHOLD_FRACTION = 0.2;
const LOW_CREDIT_ABS_MINIMUM = 0.05;
const LOW_CREDIT_EMAIL_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 1 per day

export async function requireApiKey(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header. Use: Bearer <your-api-key>" });
    return;
  }

  const rawKey = authHeader.slice(7).trim();
  if (!rawKey) {
    res.status(401).json({ error: "API key is empty" });
    return;
  }

  const keyHash = hashApiKey(rawKey);

  const rows = await db
    .select()
    .from(apiKeysTable)
    .leftJoin(plansTable, eq(apiKeysTable.planId, plansTable.id))
    .where(eq(apiKeysTable.keyHash, keyHash))
    .limit(1);

  if (rows.length === 0) {
    res.status(401).json({ error: "Invalid API key" });
    return;
  }

  const row = rows[0]!;
  const key = row.api_keys;
  const plan = row.plans;

  if (!key.isActive) {
    res.status(401).json({ error: "API key has been revoked" });
    return;
  }

  if (!plan) {
    res.status(403).json({
      error: "This API key has no plan assigned. Contact your administrator to assign a plan before making API calls.",
    });
    return;
  }

  const [userRow] = await db
    .select({
      creditBalance: usersTable.creditBalance,
      emailVerified: usersTable.emailVerified,
      name: usersTable.name,
      email: usersTable.email,
      creditWarningEmailSentAt: usersTable.creditWarningEmailSentAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, key.userId))
    .limit(1);

  // T2: Enforce email verification for API access
  if (!userRow?.emailVerified) {
    res.status(403).json({
      error: "Email verification required. Please verify your email address before making API calls. Check your inbox for the verification link.",
    });
    return;
  }

  const accountCreditBalance = userRow?.creditBalance ?? 0;

  if (accountCreditBalance <= 0) {
    res.status(402).json({ error: "Insufficient credits. Please contact your administrator to top up your account." });
    return;
  }

  res.setHeader("X-Credit-Balance", accountCreditBalance.toFixed(6));

  const lowThreshold = Math.max(
    plan.monthlyCredits * LOW_CREDIT_THRESHOLD_FRACTION,
    LOW_CREDIT_ABS_MINIMUM,
  );

  const isLowCredit = accountCreditBalance < lowThreshold;

  if (isLowCredit) {
    const pct = ((accountCreditBalance / plan.monthlyCredits) * 100).toFixed(1);
    res.setHeader(
      "X-Credit-Warning",
      `Low balance: $${accountCreditBalance.toFixed(4)} remaining (${pct}% of plan). Contact your admin to top up.`,
    );

    // T7: Send low-credit email notification (at most once per day)
    const lastSent = userRow?.creditWarningEmailSentAt;
    const shouldSendEmail = !lastSent || (Date.now() - lastSent.getTime()) > LOW_CREDIT_EMAIL_COOLDOWN_MS;

    if (shouldSendEmail && userRow?.email && userRow?.name) {
      // Non-blocking — don't delay the request
      db.update(usersTable)
        .set({ creditWarningEmailSentAt: new Date() })
        .where(eq(usersTable.id, key.userId))
        .then(() => {
          const emailContent = buildLowCreditEmail(userRow.name, accountCreditBalance, plan.monthlyCredits);
          return sendEmail({ to: userRow.email, ...emailContent });
        })
        .catch((err) => {
          logger.warn({ err, userId: key.userId }, "Failed to send low-credit email");
        });
    }
  }

  req.apiKey = { ...key, plan, accountCreditBalance };

  await db
    .update(apiKeysTable)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeysTable.id, key.id));

  next();
}
