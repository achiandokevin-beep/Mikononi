import { cfg } from "../config";
/** LLM abstraction (Anthropic Messages API, server-side only). Returns null when no key is set or the call fails; callers must have a non-AI fallback. */
export async function complete(system: string, user: string): Promise<string | null> {
  if (!cfg.aiKey) return null;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal: AbortSignal.timeout(10_000),
      headers: { "content-type": "application/json", "x-api-key": cfg.aiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: cfg.aiModel, max_tokens: 300, system, messages: [{ role: "user", content: user }] }),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { content?: { text?: string }[] };
    return j.content?.[0]?.text?.trim() || null;
  } catch { return null; }
}
