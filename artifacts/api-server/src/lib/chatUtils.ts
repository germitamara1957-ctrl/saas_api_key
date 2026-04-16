import { eq, sql, and } from "drizzle-orm";
import { db, usersTable, usageLogsTable } from "@workspace/db";
import { calculateChatCost } from "./billing";

// ── Think-tag filter ────────────────────────────────────────────────────────
// Some reasoning models (MiniMax-M2, DeepSeek-R1, Kimi-K2, etc.) emit
// chain-of-thought wrapped in <think>...</think> blocks. We strip these
// before returning the content to the caller.

export function stripThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trimStart();
}

// Streaming variant: processes chunks incrementally so <think> blocks that
// span multiple SSE events are correctly suppressed.
export class ThinkTagFilter {
  private buf = "";
  private inside = false;

  push(chunk: string): string {
    this.buf += chunk;
    let out = "";
    while (true) {
      if (this.inside) {
        const end = this.buf.indexOf("</think>");
        if (end === -1) {
          this.buf = this.buf.slice(Math.max(0, this.buf.length - 7));
          break;
        }
        this.buf = this.buf.slice(end + 8);
        this.inside = false;
      } else {
        const start = this.buf.indexOf("<think>");
        if (start === -1) {
          const partial = this._partialPrefix("<think>");
          out += this.buf.slice(0, this.buf.length - partial);
          this.buf = this.buf.slice(this.buf.length - partial);
          break;
        }
        out += this.buf.slice(0, start);
        this.buf = this.buf.slice(start + 7);
        this.inside = true;
      }
    }
    return out;
  }

  flush(): string {
    const out = this.inside ? "" : this.buf;
    this.buf = "";
    this.inside = false;
    return out;
  }

  private _partialPrefix(tag: string): number {
    for (let len = Math.min(tag.length - 1, this.buf.length); len > 0; len--) {
      if (tag.startsWith(this.buf.slice(this.buf.length - len))) return len;
    }
    return 0;
  }
}

// ── Deduct credits + log usage ───────────────────────────────────────────────
// Atomically deducts credits and records a usage log in one DB transaction.
// Returns false if the user had insufficient credits (concurrent exhaustion).

export async function deductAndLog(
  userId: number,
  apiKeyId: number,
  model: string,
  requestId: string,
  inputTokens: number,
  outputTokens: number,
  costUsd: number,
): Promise<boolean> {
  const totalTokens = inputTokens + outputTokens;

  const updated = await db
    .update(usersTable)
    .set({ creditBalance: sql`${usersTable.creditBalance} - ${costUsd}` })
    .where(
      and(
        eq(usersTable.id, userId),
        sql`${usersTable.creditBalance} >= ${costUsd}`,
      ),
    )
    .returning({ newBalance: usersTable.creditBalance });

  const sufficient = updated.length > 0;

  await db.insert(usageLogsTable).values({
    apiKeyId,
    model,
    inputTokens,
    outputTokens,
    totalTokens,
    costUsd: sufficient ? costUsd : 0,
    requestId,
    status: sufficient ? "success" : "error",
    errorMessage: sufficient ? null : "Insufficient credits at billing time",
  });

  return sufficient;
}

// ── Estimate cost for pre-flight check ──────────────────────────────────────

export function estimateChatCost(
  messages: Array<{ content: string | unknown[] }>,
  model: string,
  maxOutputTokens: number | undefined,
): number {
  const estimatedInput = messages.reduce((acc, m) => {
    const text = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    return acc + Math.ceil(text.length / 4);
  }, 0);
  const estimatedOutput = maxOutputTokens ?? 2000;
  return calculateChatCost(model, estimatedInput, estimatedOutput);
}
