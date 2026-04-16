import { Router, type IRouter } from "express";
import { eq, sql, and } from "drizzle-orm";
import { db, usersTable, usageLogsTable } from "@workspace/db";
import { GenerateVideoBody } from "@workspace/api-zod";
import { requireApiKey } from "../../middlewares/apiKeyAuth";
import { checkRateLimit } from "../../lib/rateLimit";
import { generateVideoWithVeo, getVideoJobStatus, normalizeToPlanModelId } from "../../lib/vertexai";
import { calculateVideoCost } from "../../lib/billing";
import { generateRequestId } from "../../lib/crypto";

const router: IRouter = Router();

router.post("/v1/video", requireApiKey, async (req, res): Promise<void> => {
  const parsed = GenerateVideoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { model: rawModel = "veo-3.1-generate-001", prompt, durationSeconds = 5 } = parsed.data;
  const model = rawModel.toLowerCase().trim();
  const apiKey = req.apiKey!;
  const requestId = generateRequestId();

  // Only Veo video-generation models are accepted on this endpoint
  if (!model.startsWith("veo-")) {
    res.status(400).json({
      error: `Model "${model}" is not supported on this endpoint. ` +
        `Only Veo models (veo-*) are accepted here. ` +
        `Use POST /v1/chat for text models or POST /v1/generate for Imagen image models.`,
    });
    return;
  }

  const allowed = apiKey.plan.modelsAllowed;
  const planModel = normalizeToPlanModelId(model);
  if (allowed.length > 0 && !allowed.includes(planModel)) {
    const errMsg = `Model "${model}" is not allowed on your current plan. Allowed models: ${allowed.join(", ")}`;
    await db.insert(usageLogsTable).values({
      apiKeyId: apiKey.id, model, inputTokens: 0, outputTokens: 0,
      totalTokens: 0, costUsd: 0, requestId, status: "rejected", errorMessage: errMsg,
    });
    res.status(403).json({ error: errMsg });
    return;
  }

  const withinLimit = await checkRateLimit(apiKey.userId, apiKey.plan.rpm);
  if (!withinLimit) {
    const errMsg = `Rate limit exceeded. Your account allows ${apiKey.plan.rpm} requests per minute (shared across all your API keys).`;
    await db.insert(usageLogsTable).values({
      apiKeyId: apiKey.id, model, inputTokens: 0, outputTokens: 0,
      totalTokens: 0, costUsd: 0, requestId, status: "rejected", errorMessage: errMsg,
    });
    res.status(429).json({ error: errMsg });
    return;
  }

  const costUsd = calculateVideoCost(planModel, durationSeconds);

  if (apiKey.accountCreditBalance < costUsd) {
    const errMsg = "Insufficient credits for this request.";
    await db.insert(usageLogsTable).values({
      apiKeyId: apiKey.id, model, inputTokens: 0, outputTokens: 0,
      totalTokens: 0, costUsd: 0, requestId, status: "rejected", errorMessage: errMsg,
    });
    res.status(402).json({ error: errMsg });
    return;
  }

  let jobResult;
  try {
    jobResult = await generateVideoWithVeo(model, prompt, durationSeconds);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    await db.insert(usageLogsTable).values({
      apiKeyId: apiKey.id, model, inputTokens: 0, outputTokens: 0,
      totalTokens: 0, costUsd: 0, requestId, jobOperationId: null, status: "error", errorMessage,
    });
    res.status(502).json({ error: `Veo API error: ${errorMessage}` });
    return;
  }

  // Atomically deduct + log in a single transaction
  let sufficient = true;
  await db.transaction(async (tx) => {
    const [deducted] = await tx
      .update(usersTable)
      .set({ creditBalance: sql`credit_balance - ${costUsd}` })
      .where(and(eq(usersTable.id, apiKey.userId), sql`credit_balance >= ${costUsd}`))
      .returning({ creditBalance: usersTable.creditBalance });

    if (!deducted) {
      sufficient = false;
      await tx.insert(usageLogsTable).values({
        apiKeyId: apiKey.id, model, inputTokens: 0, outputTokens: durationSeconds,
        totalTokens: durationSeconds, costUsd: 0, requestId,
        jobOperationId: jobResult.operationName, status: "rejected",
        errorMessage: "Insufficient credits (concurrent request exhausted balance)",
      });
      return;
    }

    await tx.insert(usageLogsTable).values({
      apiKeyId: apiKey.id, model, inputTokens: 0, outputTokens: durationSeconds,
      totalTokens: durationSeconds, costUsd, requestId,
      jobOperationId: jobResult.operationName, status: "success", errorMessage: null,
    });
  });

  if (!sufficient) {
    res.status(402).json({ error: "Insufficient credits to complete this request." });
    return;
  }

  res.status(202).json({
    jobId: requestId,
    status: "pending",
    videoUrl: null,
    errorMessage: null,
    model,
    costUsd,
  });
});

router.get("/v1/video/:jobId/status", requireApiKey, async (req, res): Promise<void> => {
  const jobId = String(req.params.jobId);
  const apiKey = req.apiKey!;

  const rows = await db
    .select({
      jobOperationId: usageLogsTable.jobOperationId,
      model: usageLogsTable.model,
      costUsd: usageLogsTable.costUsd,
    })
    .from(usageLogsTable)
    .where(
      and(
        eq(usageLogsTable.requestId, jobId),
        eq(usageLogsTable.apiKeyId, apiKey.id),
      )
    )
    .limit(1);

  if (rows.length === 0) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const row = rows[0]!;
  if (!row.jobOperationId) {
    res.status(400).json({ error: "Job has no associated operation ID" });
    return;
  }

  try {
    const status = await getVideoJobStatus(row.jobOperationId);

    if (status.done) {
      res.json({
        jobId,
        status: "completed",
        videoUrl: status.videoUri ?? null,
        errorMessage: null,
        model: row.model,
        costUsd: row.costUsd,
      });
    } else {
      res.json({
        jobId,
        status: "pending",
        videoUrl: null,
        errorMessage: null,
        model: row.model,
        costUsd: row.costUsd,
      });
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    res.status(502).json({ error: `Veo status check failed: ${errorMessage}` });
  }
});

export default router;
