// 서버에서만 쓴다. OPENAI_API_KEY를 읽으므로 클라이언트 코드에서 import하지 않는다.

/** 모델 선택의 근거는 docs/decisions/llm-models.md에 있다. */
export const CHAT_MODEL = "gpt-6-luna";
export const FEEDBACK_MODEL = "gpt-6-luna";

// OPENAI_BASE_URL은 로컬 테스트에서 OpenAI 대신 가짜 응답 서버를 붙일 때만 쓴다.
function endpoint(): string {
  const base = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  return `${base.replace(/\/+$/, "")}/responses`;
}

export class UpstreamError extends Error {}

export function hasApiKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

interface InputMessage {
  role: "user" | "assistant";
  content: string;
}

interface Reasoning {
  effort?: "none" | "low" | "medium" | "high";
  mode?: "standard" | "pro";
}

interface OutputItem {
  type?: string;
  content?: { type?: string; text?: unknown }[];
}

export async function complete(options: {
  model: string;
  instructions: string;
  input: InputMessage[];
  reasoning: Reasoning;
  maxOutputTokens: number;
}): Promise<string> {
  let response: Response;
  try {
    response = await fetch(endpoint(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: options.model,
        instructions: options.instructions,
        input: options.input,
        reasoning: options.reasoning,
        max_output_tokens: options.maxOutputTokens,
        // 연습 대화 내용이 OpenAI에 저장되지 않게 한다.
        store: false,
      }),
    });
  } catch (error) {
    // 방화벽 차단이나 오프라인처럼 요청이 OpenAI에 닿지 못한 경우다.
    console.error(
      `[openai] request failed: ${error instanceof Error ? error.message : "unknown"}`,
    );
    throw new UpstreamError("OpenAI request failed");
  }
  if (!response.ok) {
    // 원인을 알 수 있게 상태와 오류 종류만 서버 로그에 남긴다. 본문에는 키 일부가 들어 있을 수 있어 남기지 않는다.
    const body = (await response.json().catch(() => null)) as {
      error?: { type?: unknown; code?: unknown };
    } | null;
    console.error(
      `[openai] ${response.status} type=${String(body?.error?.type)} code=${String(body?.error?.code)}`,
    );
    throw new UpstreamError(`OpenAI responded ${response.status}`);
  }

  const data = (await response.json().catch(() => null)) as {
    output?: OutputItem[];
  } | null;
  // 추론 항목은 건너뛰고 메시지 항목의 output_text만 이어 붙인다.
  const text = (data?.output ?? [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === "output_text" && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("")
    .trim();
  if (text === "") {
    // 추론에 토큰을 다 쓰면 status가 incomplete이고 답 글자가 비어 온다.
    console.error("[openai] response had no output text");
    throw new UpstreamError("OpenAI returned no text");
  }
  return text;
}
