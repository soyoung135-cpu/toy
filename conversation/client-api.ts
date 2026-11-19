import type { Correction, Message } from "./types";

/** OpenAI가 돌려준 상태와 오류 종류. 서버가 upstream_failed일 때 담아 준다. */
export interface Upstream {
  status: number;
  code?: string;
}

/** 서버가 돌려준 실패. code는 서버 응답의 error 값이다(예: llm_not_configured). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code?: string,
    readonly upstream?: Upstream,
  ) {
    super(`request failed with ${status}${code ? ` (${code})` : ""}`);
  }
}

function readUpstream(value: unknown): Upstream | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { status, code } = value as { status?: unknown; code?: unknown };
  if (typeof status !== "number") return undefined;
  return { status, code: typeof code === "string" ? code : undefined };
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
    const data = (await response.json().catch(() => null)) as {
      error?: unknown;
      upstream?: unknown;
    } | null;
    throw new ApiError(
      response.status,
      typeof data?.error === "string" ? data.error : undefined,
      readUpstream(data?.upstream),
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
      return describeUpstream(error.upstream);
    case "unauthorized":
      return "로그인이 풀렸습니다. 새로고침해서 다시 로그인해 주세요.";
    case "auth_unavailable":
    case "auth_not_configured":
      return "로그인 설정에 문제가 있습니다.";
    default:
      return `(서버 응답 코드 ${error.status})`;
  }
}

const CHECK_LOG = "서버 로그의 [openai] 줄에서 원인을 볼 수 있습니다.";

// 확인된 OpenAI 오류 종류에 맞춰 대처를 안내한다. 모르는 종류는 코드만 보여 주고 로그를 보라고 한다.
function upstreamHint(upstream: Upstream): string {
  if (upstream.code === "invalid_api_key" || upstream.status === 401) {
    return "OpenAI 키가 올바른지 확인해 주세요.";
  }
  if (upstream.code === "model_not_found" || upstream.status === 404) {
    return "이 키로 gpt-6-luna를 쓸 수 있는지 확인해 주세요.";
  }
  if (upstream.code === "insufficient_quota") {
    return "OpenAI 계정의 크레딧이나 결제 설정을 확인해 주세요.";
  }
  if (upstream.code === "rate_limit_exceeded" || upstream.status === 429) {
    return "잠시 후 다시 시도해 주세요.";
  }
  return CHECK_LOG;
}

function describeUpstream(upstream?: Upstream): string {
  const base = "AI 서비스 호출이 실패했습니다";
  if (!upstream) return `${base}(${CHECK_LOG})`;
  if (upstream.code === "network_error") {
    return "서버에서 OpenAI에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (upstream.code === "empty_output") {
    return "모델이 글자 답을 내지 못했습니다(생각에 토큰을 다 썼을 수 있습니다).";
  }
  if (upstream.code === "invalid_output") {
    return "모델이 형식에 맞지 않는 교정을 냈습니다. 다시 시도해 주세요.";
  }
  const detail = `OpenAI 응답 ${upstream.status}${upstream.code ? `, ${upstream.code}` : ""}`;
  return `${base}(${detail}). ${upstreamHint(upstream)}`;
}
