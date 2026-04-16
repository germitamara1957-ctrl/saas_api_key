import { Router, type IRouter } from "express";
import { db, usageLogsTable } from "@workspace/db";
import { ChatCompletionBody } from "@workspace/api-zod";
import { requireApiKey } from "../../middlewares/apiKeyAuth";
import { checkRateLimit } from "../../lib/rateLimit";
import {
  detectModelProvider,
  normalizeToPlanModelId,
  chatWithGemini,
  chatWithOpenAICompat,
  chatWithMistralRawPredict,
  streamChatWithGemini,
  streamChatWithOpenAICompat,
  streamChatWithMistralRawPredict,
  type ChatMessage,
} from "../../lib/vertexai";
import { calculateChatCost } from "../../lib/billing";
import { generateRequestId } from "../../lib/crypto";
import {
  checkContent,
  injectSafetyPrompt,
  isGuardrailSuspended,
  recordViolation,
} from "../../lib/guardrails";
import { stripThinkTags, ThinkTagFilter, deductAndLog } from "../../lib/chatUtils";
import { dispatchWebhooks } from "../../lib/webhookDispatcher";

const router: IRouter = Router();

/**
 * Core chat handler — shared by /v1/chat and /v1/chat/completions
 */
async function handleChat(
  req: Parameters<Parameters<typeof router.post>[1]>[0],
  res: Parameters<Parameters<typeof router.post>[1]>[1],
  openaiCompat: boolean,
): Promise<void> {
  // Accept both our format and OpenAI format
  const body = req.body as Record<string, unknown>;
  const normalizedBody = {
    model: body.model,
    messages: body.messages,
    stream: body.stream ?? false,
    temperature: body.temperature,
    maxOutputTokens: (body.maxOutputTokens ?? body.max_tokens) as number | undefined,
  };

  const parsed = ChatCompletionBody.safeParse(normalizedBody);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { model: rawModel, messages, temperature, maxOutputTokens, stream } = parsed.data;
  const model = rawModel.toLowerCase().trim();
  const apiKey = req.apiKey!;
  const requestId = generateRequestId();
  const created = Math.floor(Date.now() / 1000);

  // imagen-* and veo-* are generation-only models; they cannot be used as chat models
  if (model.startsWith("imagen-") || model.startsWith("veo-")) {
    res.status(400).json({
      error: `Model "${model}" is an image/video generation model and is not supported on this endpoint. ` +
        `Use POST /v1/generate for Imagen models or POST /v1/video for Veo models.`,
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

  // ── Layer 4 (pre-check): reject immediately if account is already suspended ──
  const suspended = await isGuardrailSuspended(apiKey.userId);
  if (suspended) {
    res.status(403).json({
      error:
        "🚫 حسابك موقوف بسبب انتهاك متكرر لسياسات الاستخدام. تواصل مع الدعم الفني. | " +
        "Your account has been suspended due to repeated policy violations. Please contact support.",
    });
    return;
  }

  const estimatedInputTokens = messages.reduce((acc, m) => {
    const rawContent = m.content as string | Array<{ type: string; text?: string }>;
    const text = typeof rawContent === "string"
      ? rawContent
      : rawContent.filter((p) => p.type === "text").map((p) => p.text ?? "").join(" ");
    return acc + Math.ceil(text.length / 4);
  }, 0);
  const estimatedOutputTokens = maxOutputTokens ?? 2000;
  const minEstimatedCost = calculateChatCost(planModel, estimatedInputTokens, estimatedOutputTokens);
  if (apiKey.accountCreditBalance < minEstimatedCost) {
    const errMsg = `Insufficient credits. Your account balance ($${apiKey.accountCreditBalance.toFixed(6)}) is below the minimum required to make a request with this model.`;
    await db.insert(usageLogsTable).values({
      apiKeyId: apiKey.id, model, inputTokens: 0, outputTokens: 0,
      totalTokens: 0, costUsd: 0, requestId, status: "rejected", errorMessage: errMsg,
    });
    res.status(402).json({ error: errMsg });
    return;
  }

  const mappedMessages: ChatMessage[] = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    content: m.content,
  }));

  // ── Layer 3: Keyword content check ────────────────────────────────────────
  const contentCheck = checkContent(mappedMessages);
  if (contentCheck.blocked) {
    const violation = await recordViolation(apiKey.userId, contentCheck.category!, {
      apiKeyId: apiKey.id,
      requestId,
      model,
      messages: mappedMessages,
      ip: (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ?? req.socket?.remoteAddress,
    });
    await db.insert(usageLogsTable).values({
      apiKeyId: apiKey.id, model, inputTokens: 0, outputTokens: 0,
      totalTokens: 0, costUsd: 0, requestId, status: "rejected",
      errorMessage: `Guardrail blocked (${contentCheck.category}). Violation #${violation.warningNumber}`,
    });
    res.status(400).json({ error: violation.message });
    return;
  }

  // ── Layer 2: Inject hidden safety system prompt ───────────────────────────
  const guardedMessages = injectSafetyPrompt(mappedMessages);

  const provider = detectModelProvider(model);

  // ── Multimodal model validation ───────────────────────────────────────────
  // Images in message content are only supported for Gemini models.
  // Reject early with a clear error instead of silently stripping images.
  if (provider === "openai-compat" || provider === "mistral-raw-predict") {
    const hasImages = guardedMessages.some((msg) =>
      Array.isArray(msg.content) &&
      msg.content.some((part) => part.type === "image"),
    );
    if (hasImages) {
      res.status(400).json({
        error: `Model "${model}" does not support image inputs. Image content is only supported for Gemini models (gemini-*).`,
      });
      return;
    }
  }

  const opts = {
    temperature: temperature ?? undefined,
    maxOutputTokens: maxOutputTokens ?? undefined,
  };

  if (stream) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    let inputTokens = 0;
    let outputTokens = 0;
    let streamError: string | null = null;
    let clientDisconnected = false;
    const thinkFilter = new ThinkTagFilter();
    const abortController = new AbortController();

    res.on("close", () => {
      clientDisconnected = true;
      abortController.abort();
    });

    const emitDelta = (text: string) => {
      if (!text || clientDisconnected) return;
      if (openaiCompat) {
        const chunk = {
          id: requestId,
          object: "chat.completion.chunk",
          created,
          model,
          choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
        };
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      } else {
        res.write(`data: ${JSON.stringify({ id: requestId, model, delta: text })}\n\n`);
      }
    };

    const optsWithSignal = { ...opts, signal: abortController.signal };

    try {
      const generator =
        provider === "gemini"
          ? streamChatWithGemini(model, guardedMessages, optsWithSignal)
          : provider === "mistral-raw-predict"
            ? streamChatWithMistralRawPredict(model, guardedMessages, optsWithSignal)
            : streamChatWithOpenAICompat(model, guardedMessages, optsWithSignal);

      for await (const event of generator) {
        if (event.type === "delta") {
          emitDelta(thinkFilter.push(event.text));
        } else {
          // Final done event — flush any buffered text outside think blocks
          emitDelta(thinkFilter.flush());
          inputTokens = event.inputTokens;
          outputTokens = event.outputTokens;
        }
      }
    } catch (err) {
      streamError = err instanceof Error ? err.message : "Unknown error";
    }

    const costUsd = calculateChatCost(model, inputTokens, outputTokens);

    if (streamError) {
      await db.insert(usageLogsTable).values({
        apiKeyId: apiKey.id, model, inputTokens, outputTokens,
        totalTokens: inputTokens + outputTokens,
        costUsd: costUsd > 0 ? costUsd : 0,
        requestId, status: "error", errorMessage: streamError,
      });
      if (costUsd > 0) {
        await deductAndLog(apiKey.userId, apiKey.id, model, requestId, inputTokens, outputTokens, costUsd);
      }
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ error: `API error: ${streamError}` })}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
      }
      return;
    }

    const sufficient = await deductAndLog(
      apiKey.userId, apiKey.id, model, requestId, inputTokens, outputTokens, costUsd,
    );

    if (sufficient) {
      void dispatchWebhooks(apiKey.userId, "usage.success", {
        model, requestId, inputTokens, outputTokens, costUsd,
      });
    }

    if (!res.writableEnded) {
      if (!sufficient) {
        res.write(`data: ${JSON.stringify({ error: "Insufficient credits to complete this request." })}\n\n`);
      } else if (!clientDisconnected) {
        if (openaiCompat) {
          const doneChunk = {
            id: requestId,
            object: "chat.completion.chunk",
            created,
            model,
            choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
            usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens },
          };
          res.write(`data: ${JSON.stringify(doneChunk)}\n\n`);
        } else {
          res.write(
            `data: ${JSON.stringify({ id: requestId, model, done: true, inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, costUsd })}\n\n`,
          );
        }
      }
      res.write("data: [DONE]\n\n");
      res.end();
    }
    return;
  }

  // Non-streaming
  let chatResult;
  try {
    chatResult =
      provider === "gemini"
        ? await chatWithGemini(model, guardedMessages, opts)
        : provider === "mistral-raw-predict"
          ? await chatWithMistralRawPredict(model, guardedMessages, opts)
          : await chatWithOpenAICompat(model, guardedMessages, opts);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    await db.insert(usageLogsTable).values({
      apiKeyId: apiKey.id, model, inputTokens: 0, outputTokens: 0,
      totalTokens: 0, costUsd: 0, requestId, status: "error", errorMessage,
    });
    res.status(502).json({ error: `API error: ${errorMessage}` });
    return;
  }

  const costUsd = calculateChatCost(model, chatResult.inputTokens, chatResult.outputTokens);
  const sufficient = await deductAndLog(
    apiKey.userId, apiKey.id, model, requestId,
    chatResult.inputTokens, chatResult.outputTokens, costUsd,
  );

  if (!sufficient) {
    res.status(402).json({ error: "Insufficient credits to complete this request." });
    return;
  }

  void dispatchWebhooks(apiKey.userId, "usage.success", {
    model, requestId,
    inputTokens: chatResult.inputTokens,
    outputTokens: chatResult.outputTokens,
    costUsd,
  });

  const cleanContent = stripThinkTags(chatResult.content);

  if (openaiCompat) {
    res.json({
      id: requestId,
      object: "chat.completion",
      created,
      model,
      choices: [{
        index: 0,
        message: { role: "assistant", content: cleanContent },
        finish_reason: "stop",
      }],
      usage: {
        prompt_tokens: chatResult.inputTokens,
        completion_tokens: chatResult.outputTokens,
        total_tokens: chatResult.inputTokens + chatResult.outputTokens,
      },
    });
  } else {
    res.json({
      id: requestId,
      model,
      content: cleanContent,
      inputTokens: chatResult.inputTokens,
      outputTokens: chatResult.outputTokens,
      totalTokens: chatResult.inputTokens + chatResult.outputTokens,
      costUsd,
    });
  }
}

// Original endpoint (our format)
router.post("/v1/chat", requireApiKey, (req, res) => handleChat(req, res, false));

// OpenAI-compatible endpoint (used by n8n, LangChain, etc.)
router.post("/v1/chat/completions", requireApiKey, (req, res) => handleChat(req, res, true));

export default router;
