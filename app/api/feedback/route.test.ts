// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { POST } from "./route";

const SECRET = "sk-or-test-secret-123";

function feedbackRequest(body: unknown) {
  return new Request("http://localhost/api/feedback", {
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

const messages = [
  { role: "assistant", content: "Hello, how can I help you?" },
  { role: "user", content: "I go to office yesterday" },
  { role: "assistant", content: "Oh, how was it?" },
  { role: "user", content: "It was fine." },
  { role: "assistant", content: "Great!" },
];

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("OPENROUTER_API_KEY", SECRET);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test("교정은 gpt-6-luna-pro로 요청하고 모델이 낸 JSON을 교정 목록으로 돌려준다", async () => {
  const modelJson = JSON.stringify({
    corrections: [
      {
        original: "I go to office yesterday",
        corrected: "I went to the office yesterday",
        explanation:
          "과거를 나타내는 yesterday가 있어 went를 쓰고 office 앞에는 the가 필요합니다.",
      },
    ],
  });
  const fetchMock = vi.fn(async () =>
    openRouterReply("```json\n" + modelJson + "\n```"),
  );
  vi.stubGlobal("fetch", fetchMock);

  const response = await POST(feedbackRequest({ messages }));
  const text = await response.text();

  expect(response.status).toBe(200);
  expect(JSON.parse(text)).toEqual(JSON.parse(modelJson));
  const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(JSON.parse(init.body as string).model).toBe("openai/gpt-6-luna-pro");
  expect(text).not.toContain(SECRET);
});

test("내가 한 말이 없으면 모델을 부르지 않고 빈 교정을 돌려준다", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  const response = await POST(
    feedbackRequest({ messages: [{ role: "assistant", content: "Hello!" }] }),
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ corrections: [] });
  expect(fetchMock).not.toHaveBeenCalled();
});

test("모델이 JSON이 아닌 답을 내면 502이다", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => openRouterReply("Sorry, no JSON.")));

  const response = await POST(feedbackRequest({ messages }));

  expect(response.status).toBe(502);
});

test("교정 항목의 모양이 틀리면 502이다", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      openRouterReply(JSON.stringify({ corrections: [{ original: "x" }] })),
    ),
  );

  const response = await POST(feedbackRequest({ messages }));

  expect(response.status).toBe(502);
});

test("잘못된 본문은 400이다", async () => {
  vi.stubGlobal("fetch", vi.fn());

  const response = await POST(feedbackRequest({ messages: "nope" }));

  expect(response.status).toBe(400);
});

test("키가 없으면 개발 환경에서는 가짜 교정을 주고 운영 환경에서는 503이다", async () => {
  vi.stubEnv("OPENROUTER_API_KEY", "");
  vi.stubGlobal("fetch", vi.fn());

  vi.stubEnv("NODE_ENV", "development");
  const dev = await POST(feedbackRequest({ messages }));
  const devBody = await dev.json();
  expect(dev.status).toBe(200);
  expect(devBody.fake).toBe(true);
  expect(Array.isArray(devBody.corrections)).toBe(true);

  vi.stubEnv("NODE_ENV", "production");
  const prod = await POST(feedbackRequest({ messages }));
  expect(prod.status).toBe(503);
});
