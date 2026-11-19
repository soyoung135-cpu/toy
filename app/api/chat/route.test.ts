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

function openRouterReply(content: string) {
  return new Response(
    JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }),
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
  vi.stubEnv("OPENROUTER_API_KEY", SECRET);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test("키가 있으면 OpenRouter에 gpt-6-luna로 요청하고 답만 돌려준다", async () => {
  const fetchMock = vi.fn(async () => openRouterReply("Welcome to the hotel!"));
  vi.stubGlobal("fetch", fetchMock);

  const response = await POST(
    chatRequest({ personaId: "hotel-front-desk", messages: [] }),
  );
  const text = await response.text();

  expect(response.status).toBe(200);
  expect(JSON.parse(text)).toEqual({ reply: "Welcome to the hotel!" });
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
  expect((init.headers as Record<string, string>).Authorization).toBe(
    `Bearer ${SECRET}`,
  );
  expect(JSON.parse(init.body as string).model).toBe("openai/gpt-6-luna");
  // AC9: 응답 어디에도 키가 나타나지 않는다.
  expect(text).not.toContain(SECRET);
});

test("페르소나 지시문은 역할을 유지하고 대화 중 교정하지 않으라고 한다", async () => {
  const fetchMock = vi.fn(async () => openRouterReply("Hi"));
  vi.stubGlobal("fetch", fetchMock);

  await POST(chatRequest({ personaId: "hotel-front-desk", messages: [] }));
  const prompt = sentBody(fetchMock).messages[0].content as string;

  expect(prompt).toContain("Emma");
  expect(prompt).toMatch(/never correct/i);
  expect(prompt).toMatch(/stay in (your )?role/i);
});

test("지금까지의 대화가 그대로 모델에 전달되고, 맨 앞에는 시작 신호 사용자 메시지가 붙는다", async () => {
  const fetchMock = vi.fn(async () => openRouterReply("ok"));
  vi.stubGlobal("fetch", fetchMock);
  const messages = pairs(1);

  await POST(chatRequest({ personaId: "cafe-barista", messages }));
  const sent = sentBody(fetchMock).messages;

  expect(sent[0].role).toBe("system");
  expect(sent[1].role).toBe("user");
  expect(sent.slice(2)).toEqual(messages);
});

test("20번째 턴의 답에서는 마무리를 제안하라고 지시하고 그 전에는 하지 않는다", async () => {
  const early = vi.fn(async () => openRouterReply("ok"));
  vi.stubGlobal("fetch", early);
  await POST(
    chatRequest({
      personaId: "cafe-barista",
      messages: [...pairs(4), { role: "user", content: "me" }],
    }),
  );
  expect(sentBody(early).messages[0].content).not.toMatch(/wrap up/i);

  const goal = vi.fn(async () => openRouterReply("ok"));
  vi.stubGlobal("fetch", goal);
  await POST(
    chatRequest({
      personaId: "cafe-barista",
      messages: [...pairs(19), { role: "user", content: "me" }],
    }),
  );
  expect(sentBody(goal).messages[0].content).toMatch(/wrap up/i);
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
  vi.stubEnv("OPENROUTER_API_KEY", "");
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
  vi.stubEnv("OPENROUTER_API_KEY", "");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubGlobal("fetch", vi.fn());

  const response = await POST(
    chatRequest({ personaId: "hotel-front-desk", messages: [] }),
  );

  expect(response.status).toBe(503);
});

test("OpenRouter가 실패하면 502이고 오류 본문에 키가 없다", async () => {
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
