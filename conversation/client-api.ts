import type { Correction, Message } from "./types";

/** 서버가 돌려준 실패. code는 서버 응답의 error 값이다(예: llm_not_configured). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code?: string,
  ) {
    super(`request failed with ${status}${code ? ` (${code})` : ""}`);
  }
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // 서버에 닿지 못한 경우(오프라인, 연결이 끊김 등). 상태 코드가 없어 0으로 둔다.
    throw new ApiError(0, "network_error");
  }
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: unknown } | null;
    throw new ApiError(
      response.status,
      typeof data?.error === "string" ? data.error : undefined,
    );
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError(response.status, "invalid_response");
  }
}

export async function requestReply(
  personaId: string,
  messages: Message[],
): Promise<string> {
  const data = await postJson<{ reply: string }>("/api/chat", {
    personaId,
    messages,
  });
  return data.reply;
}

export async function requestCorrections(
  messages: Message[],
): Promise<Correction[]> {
  const data = await postJson<{ corrections: Correction[] }>("/api/feedback", {
    messages,
  });
  return data.corrections;
}

/**
 * 실패를 화면에 보여 줄 한 문장으로 바꾼다.
 * 이유를 모르는 실패는 이유를 지어내지 않고, 확인된 사실(서버 응답 코드)만 알려 준다.
 */
export function describeFailure(error: unknown): string {
  if (!(error instanceof ApiError)) return "";
  switch (error.code) {
    case "network_error":
      return "서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.";
    case "invalid_response":
      return `서버가 알 수 없는 응답을 보냈습니다(서버 응답 코드 ${error.status}).`;
    case "llm_not_configured":
      return "서버에 OpenAI 키가 설정되지 않았습니다.";
    case "upstream_failed":
      return "AI 서비스 호출이 실패했습니다(서버 로그의 [openai] 줄에서 원인을 볼 수 있습니다).";
    case "unauthorized":
      return "로그인이 풀렸습니다. 새로고침해서 다시 로그인해 주세요.";
    case "auth_unavailable":
    case "auth_not_configured":
      return "로그인 설정에 문제가 있습니다.";
    default:
      return `(서버 응답 코드 ${error.status})`;
  }
}
