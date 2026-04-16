import { Router, type IRouter } from "express";
import { eq, sql, and } from "drizzle-orm";
import { db, usersTable, usageLogsTable } from "@workspace/db";
import { GenerateContentBody } from "@workspace/api-zod";
import { requireApiKey } from "../../middlewares/apiKeyAuth";
import { checkRateLimit } from "../../lib/rateLimit";
import { generateImageWithImagen, normalizeToPlanModelId } from "../../lib/vertexai";
import { calculateImageCost } from "../../lib/billing";
import { generateRequestId } from "../../lib/crypto";
import { dispatchWebhooks } from "../../lib/webhookDispatcher";

const router: IRouter = Router();

router.post("/v1/generate", requireApiKey, async (req, res): Promise<void> => {
  const parsed = GenerateContentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { model: rawModel = "imagen-3.0-generate-002", prompt, sampleCount = 1 } = parsed.data;
  const model = rawModel.toLowerCase().trim();
  const apiKey = req.apiKey!;
  const requestId = generateRequestId();

  // Only Imagen image-generation models are accepted on this endpoint
  if (!model.startsWith("imagen-")) {
    res.status(400).json({
      error: `Model "${model}" is not supported on this endpoint. ` +
        `Only Imagen models (imagen-*) are accepted here. ` +
        `Use POST /v1/chat for text models or POST /v1/video for Veo video models.`,
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

  const costUsd = calculateImageCost(planModel, sampleCount);

  if (apiKey.accountCreditBalance < costUsd) {
    const errMsg = "Insufficient credits for this request.";
    await db.insert(usageLogsTable).values({
      apiKeyId: apiKey.id, model, inputTokens: 0, outputTokens: 0,
      totalTokens: 0, costUsd: 0, requestId, status: "rejected", errorMessage: errMsg,
    });
    res.status(402).json({ error: errMsg });
    return;
  }

  let result;
  try {
    result = await generateImageWithImagen(model, prompt, sampleCount);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    await db.insert(usageLogsTable).values({
      apiKeyId: apiKey.id, model, inputTokens: 0, outputTokens: 0,
      totalTokens: 0, costUsd: 0, requestId, status: "error", errorMessage,
    });
    res.status(502).json({ error: `Imagen API error: ${errorMessage}` });
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
        apiKeyId: apiKey.id, model, inputTokens: 0, outputTokens: sampleCount,
        totalTokens: sampleCount, costUsd: 0, requestId, status: "rejected",
        errorMessage: "Insufficient credits (concurrent request exhausted balance)",
      });
      return;
    }

    await tx.insert(usageLogsTable).values({
      apiKeyId: apiKey.id, model, inputTokens: 0, outputTokens: sampleCount,
      totalTokens: sampleCount, costUsd, requestId, status: "success", errorMessage: null,
    });
  });

  if (!sufficient) {
    res.status(402).json({ error: "Insufficient credits to complete this request." });
    return;
  }

  void dispatchWebhooks(apiKey.userId, "usage.success", {
    model,
    requestId,
    imageCount: sampleCount,
    costUsd,
  });

  res.json({
    id: requestId,
    model,
    images: result.images,
    costUsd,
  });
});

export default router;
