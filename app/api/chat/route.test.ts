// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { POST } from "./route";

const SECRET = "sk-or-test-secret-123";

function chatRequest(body: unknown) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Responses API의 실제 모양: 추론 항목과 메시지 항목이 섞여 온다.
function openAiReply(text: string) {
  return new Response(
    JSON.stringify({
      status: "completed",
      output: [
        { type: "reasoning", id: "rs_1", summary: [] },
        {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text }],
        },
      ],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function pairs(count: number) {
  const messages = [{ role: "assistant", content: "Hello!" }];
  for (let i = 0; i < count; i++) {
    messages.push({ role: "user", content: `me ${i}` });
    messages.push({ role: "assistant", content: `persona ${i}` });
  }
  return messages;
}

type FetchMock = ReturnType<typeof vi.fn>;

function sentBody(fetchMock: FetchMock) {
  const init = fetchMock.mock.calls[0][1] as RequestInit;
  return JSON.parse(init.body as string);
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("OPENAI_API_KEY", SECRET);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test("키가 있으면 OpenAI Responses API에 gpt-6-luna로 요청하고 답만 돌려준다", async () => {
  const fetchMock = vi.fn(async () => openAiReply("Welcome to the hotel!"));
  vi.stubGlobal("fetch", fetchMock);

  const response = await POST(
    chatRequest({ personaId: "hotel-front-desk", messages: [] }),
  );
  const text = await response.text();

  expect(response.status).toBe(200);
  expect(JSON.parse(text)).toEqual({ reply: "Welcome to the hotel!" });
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("https://api.openai.com/v1/responses");
  expect((init.headers as Record<string, string>).Authorization).toBe(
    `Bearer ${SECRET}`,
  );
  const sent = JSON.parse(init.body as string);
  expect(sent.model).toBe("gpt-6-luna");
  expect(sent.reasoning).toEqual({ effort: "low" });
  expect(sent.store).toBe(false);
  // AC9: 응답 어디에도 키가 나타나지 않는다.
  expect(text).not.toContain(SECRET);
});

test("페르소나 지시문은 역할을 유지하고 대화 중 교정하지 않으라고 한다", async () => {
  const fetchMock = vi.fn(async () => openAiReply("Hi"));
  vi.stubGlobal("fetch", fetchMock);

  await POST(chatRequest({ personaId: "hotel-front-desk", messages: [] }));
  const prompt = sentBody(fetchMock).instructions as string;

  expect(prompt).toContain("Emma");
  expect(prompt).toMatch(/never correct/i);
  expect(prompt).toMatch(/stay in (your )?role/i);
});

test("지금까지의 대화가 그대로 모델에 전달되고, 맨 앞에는 시작 신호 사용자 메시지가 붙는다", async () => {
  const fetchMock = vi.fn(async () => openAiReply("ok"));
  vi.stubGlobal("fetch", fetchMock);
  const messages = pairs(1);

  await POST(chatRequest({ personaId: "cafe-barista", messages }));
  const sent = sentBody(fetchMock).input;

  expect(sent[0].role).toBe("user");
  expect(sent.slice(1)).toEqual(messages);
});

test("20번째 턴의 답에서는 마무리를 제안하라고 지시하고 그 전에는 하지 않는다", async () => {
  const early = vi.fn(async () => openAiReply("ok"));
  vi.stubGlobal("fetch", early);
  await POST(
    chatRequest({
      personaId: "cafe-barista",
      messages: [...pairs(4), { role: "user", content: "me" }],
    }),
  );
  expect(sentBody(early).instructions).not.toMatch(/wrap up/i);

  const goal = vi.fn(async () => openAiReply("ok"));
  vi.stubGlobal("fetch", goal);
  await POST(
    chatRequest({
      personaId: "cafe-barista",
      messages: [...pairs(19), { role: "user", content: "me" }],
    }),
  );
  expect(sentBody(goal).instructions).toMatch(/wrap up/i);
});

test("알 수 없는 페르소나나 잘못된 본문은 400이다", async () => {
  vi.stubGlobal("fetch", vi.fn());

  const unknown = await POST(chatRequest({ personaId: "nobody", messages: [] }));
  const broken = await POST(
    chatRequest({ personaId: "cafe-barista", messages: "nope" }),
  );

  expect(unknown.status).toBe(400);
  expect(broken.status).toBe(400);
});

test("키가 없으면 개발 환경에서는 가짜 답을 주고 fetch를 부르지 않는다", async () => {
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("NODE_ENV", "development");
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  const response = await POST(
    chatRequest({ personaId: "hotel-front-desk", messages: [] }),
  );
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body.fake).toBe(true);
  expect(body.reply).toEqual(expect.any(String));
  expect(fetchMock).not.toHaveBeenCalled();
});

test("키가 없으면 운영 환경에서는 가짜 답 없이 503이다", async () => {
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubGlobal("fetch", vi.fn());

  const response = await POST(
    chatRequest({ personaId: "hotel-front-desk", messages: [] }),
  );

  expect(response.status).toBe(503);
});

test("추론에 토큰을 다 써서 답 글자가 비어 오면 502이다", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            status: "incomplete",
            incomplete_details: { reason: "max_output_tokens" },
            output: [{ type: "reasoning", id: "rs_1", summary: [] }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    ),
  );

  const response = await POST(
    chatRequest({ personaId: "hotel-front-desk", messages: [] }),
  );

  expect(response.status).toBe(502);
});

test("OpenAI가 실패하면 502이고 오류 본문에 키가 없다", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(`bad key ${SECRET}`, { status: 401 })),
  );

  const response = await POST(
    chatRequest({ personaId: "hotel-front-desk", messages: [] }),
  );
  const text = await response.text();

  expect(response.status).toBe(502);
  expect(text).not.toContain(SECRET);
});
