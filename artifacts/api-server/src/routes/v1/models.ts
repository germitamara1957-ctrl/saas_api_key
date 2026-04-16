import { Router, type IRouter } from "express";
import { getSupportedModels } from "../../lib/billing";
import { requireApiKey } from "../../middlewares/apiKeyAuth";

const router: IRouter = Router();

function ownedBy(modelId: string): string {
  if (modelId.startsWith("gemini-") || modelId.startsWith("imagen-") || modelId.startsWith("veo-") || modelId.startsWith("gemma-")) return "google";
  if (modelId.startsWith("grok-")) return "xai";
  if (modelId.startsWith("mistral-") || modelId.startsWith("ministral-") || modelId.startsWith("codestral") || modelId.startsWith("jamba-")) return "mistral-ai";
  if (modelId.startsWith("deepseek-")) return "deepseek";
  if (modelId.startsWith("glm-")) return "zhipu-ai";
  if (modelId.startsWith("kimi-")) return "moonshot-ai";
  if (modelId.startsWith("minimax-")) return "minimax";
  if (modelId.startsWith("llama-")) return "meta";
  if (modelId.startsWith("gpt-oss-")) return "openai-oss";
  if (modelId.startsWith("qwen")) return "alibaba";
  return "ai-gateway";
}

router.get("/v1/models", requireApiKey, (_req, res): void => {
  const models = getSupportedModels().sort((a, b) => a.localeCompare(b));

  const data = models.map((id) => ({
    id,
    object: "model",
    created: Math.floor(Date.now() / 1000),
    owned_by: ownedBy(id),
  }));

  res.json({ object: "list", data });
});

export default router;
