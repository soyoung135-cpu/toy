// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const { requireUser } = vi.hoisted(() => ({
  requireUser: vi.fn(async (): Promise<Response | null> => null),
}));
vi.mock("@/auth/server", () => ({ requireUser }));

import { POST } from "./route";

const SECRET = "sk-or-test-secret-123";

function feedbackRequest(body: unknown) {
  return new Request("http://localhost/api/feedback", {
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

const messages = [
  { role: "assistant", content: "Hello, how can I help you?" },
  { role: "user", content: "I go to office yesterday" },
  { role: "assistant", content: "Oh, how was it?" },
  { role: "user", content: "It was fine." },
  { role: "assistant", content: "Great!" },
];

beforeEach(() => {
  requireUser.mockReset();
  requireUser.mockResolvedValue(null);
  vi.unstubAllEnvs();
  vi.stubEnv("OPENAI_API_KEY", SECRET);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test("교정은 gpt-6-luna를 pro 모드로 요청하고 모델이 낸 JSON을 교정 목록으로 돌려준다", async () => {
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
    openAiReply("```json\n" + modelJson + "\n```"),
  );
  vi.stubGlobal("fetch", fetchMock);

  const response = await POST(feedbackRequest({ messages }));
  const text = await response.text();

  expect(response.status).toBe(200);
  expect(JSON.parse(text)).toEqual(JSON.parse(modelJson));
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("https://api.openai.com/v1/responses");
  const sent = JSON.parse(init.body as string);
  expect(sent.model).toBe("gpt-6-luna");
  expect(sent.reasoning).toEqual({ mode: "pro" });
  expect(sent.store).toBe(false);
  expect(text).not.toContain(SECRET);
});

test("로그인하지 않았으면 401을 돌려주고 OpenAI를 부르지 않는다", async () => {
  requireUser.mockResolvedValueOnce(
    Response.json({ error: "unauthorized" }, { status: 401 }),
  );
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  const response = await POST(feedbackRequest({ messages }));

  expect(response.status).toBe(401);
  expect(fetchMock).not.toHaveBeenCalled();
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
  vi.stubGlobal("fetch", vi.fn(async () => openAiReply("Sorry, no JSON.")));

  const response = await POST(feedbackRequest({ messages }));

  expect(response.status).toBe(502);
});

test("교정 항목의 모양이 틀리면 502이다", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      openAiReply(JSON.stringify({ corrections: [{ original: "x" }] })),
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
  vi.stubEnv("OPENAI_API_KEY", "");
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

test("키가 없어 막을 때 서버 로그에 이유를 남긴다(키 값은 남기지 않는다)", async () => {
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubGlobal("fetch", vi.fn());
  const log = vi.spyOn(console, "error").mockImplementation(() => {});

  await POST(feedbackRequest({ messages }));

  expect(log).toHaveBeenCalledWith(expect.stringContaining("OPENAI_API_KEY"));
  log.mockRestore();
});

test("OpenAI가 429 insufficient_quota로 거절하면 상태와 코드를 502 응답에 담는다", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json(
        { error: { message: "You exceeded your current quota", type: "insufficient_quota", code: "insufficient_quota" } },
        { status: 429 },
      ),
    ),
  );
  const log = vi.spyOn(console, "error").mockImplementation(() => {});

  const response = await POST(feedbackRequest({ messages }));
  const body = await response.json();

  expect(response.status).toBe(502);
  expect(body).toEqual({
    error: "upstream_failed",
    upstream: { status: 429, code: "insufficient_quota" },
  });
  log.mockRestore();
});
