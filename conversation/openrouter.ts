// 서버에서만 쓴다. OPENROUTER_API_KEY를 읽으므로 클라이언트 코드에서 import하지 않는다.

export const CHAT_MODEL = "openai/gpt-6-luna";
export const FEEDBACK_MODEL = "openai/gpt-6-luna-pro";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export class UpstreamError extends Error {}

export function hasApiKey(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function complete(options: {
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
}): Promise<string> {
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        max_tokens: options.maxTokens,
      }),
    });
  } catch {
    throw new UpstreamError("OpenRouter request failed");
  }
  if (!response.ok) {
    throw new UpstreamError(`OpenRouter responded ${response.status}`);
  }
  const data = (await response.json().catch(() => null)) as {
    choices?: { message?: { content?: unknown } }[];
  } | null;
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new UpstreamError("OpenRouter returned no content");
  }
  return content.trim();
}
