// 서버 전용 진입점. app/api 라우트가 이 파일만 부른다.
import {
  CHAT_MODEL,
  complete,
  FEEDBACK_MODEL,
  hasApiKey,
  UpstreamError,
} from "./openrouter";
import { PERSONAS } from "./personas";
import {
  buildFeedbackPrompt,
  buildPersonaPrompt,
  formatTranscript,
  START_SIGNAL,
} from "./prompts";
import type { Correction, Message } from "./types";

function badRequest() {
  return Response.json({ error: "bad_request" }, { status: 400 });
}

function unavailable() {
  return Response.json({ error: "llm_not_configured" }, { status: 503 });
}

function upstreamFailed() {
  return Response.json({ error: "upstream_failed" }, { status: 502 });
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function parseMessages(value: unknown): Message[] | null {
  if (!Array.isArray(value)) return null;
  const messages: Message[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) return null;
    const { role, content } = item as Record<string, unknown>;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") {
      return null;
    }
    messages.push({ role, content });
  }
  return messages;
}

// 키가 없을 때는 개발 환경에서만 가짜 응답으로 화면 흐름을 돌려 볼 수 있다.
function canFake(): boolean {
  return process.env.NODE_ENV !== "production";
}

export async function handleChat(request: Request): Promise<Response> {
  const body = (await readJson(request)) as Record<string, unknown> | null;
  const persona = PERSONAS.find((p) => p.id === body?.personaId);
  const messages = parseMessages(body?.messages);
  if (!persona || !messages) return badRequest();

  if (!hasApiKey()) {
    if (!canFake()) return unavailable();
    return Response.json({
      fake: true,
      reply:
        messages.length === 0
          ? `(dev) Hello! I'm ${persona.name}. How can I help you today?`
          : "(dev) That sounds interesting. Could you tell me more?",
    });
  }

  try {
    const reply = await complete({
      model: CHAT_MODEL,
      maxTokens: 1000,
      messages: [
        { role: "system", content: buildPersonaPrompt(persona, messages) },
        { role: "user", content: START_SIGNAL },
        ...messages,
      ],
    });
    return Response.json({ reply });
  } catch (error) {
    if (error instanceof UpstreamError) return upstreamFailed();
    throw error;
  }
}

function parseCorrections(text: string): Correction[] | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const list = (parsed as { corrections?: unknown } | null)?.corrections;
  if (!Array.isArray(list)) return null;
  const corrections: Correction[] = [];
  for (const item of list) {
    const { original, corrected, explanation } = (item ?? {}) as Record<string, unknown>;
    if (
      typeof original !== "string" ||
      typeof corrected !== "string" ||
      typeof explanation !== "string"
    ) {
      return null;
    }
    corrections.push({ original, corrected, explanation });
  }
  return corrections;
}

export async function handleFeedback(request: Request): Promise<Response> {
  const body = (await readJson(request)) as Record<string, unknown> | null;
  const messages = parseMessages(body?.messages);
  if (!messages) return badRequest();

  const learnerLines = messages.filter((m) => m.role === "user");
  if (learnerLines.length === 0) return Response.json({ corrections: [] });

  if (!hasApiKey()) {
    if (!canFake()) return unavailable();
    return Response.json({
      fake: true,
      corrections: [
        {
          original: learnerLines[0].content,
          corrected: learnerLines[0].content,
          explanation: "개발용 가짜 교정입니다. OPENROUTER_API_KEY가 없어 실제 교정을 하지 않았습니다.",
        },
      ],
    });
  }

  try {
    const text = await complete({
      model: FEEDBACK_MODEL,
      maxTokens: 8000,
      messages: [
        { role: "system", content: buildFeedbackPrompt() },
        { role: "user", content: formatTranscript(messages) },
      ],
    });
    const corrections = parseCorrections(text);
    if (!corrections) return upstreamFailed();
    return Response.json({ corrections });
  } catch (error) {
    if (error instanceof UpstreamError) return upstreamFailed();
    throw error;
  }
}
