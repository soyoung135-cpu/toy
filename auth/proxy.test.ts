// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const { getClaims, createServerClient } = vi.hoisted(() => {
  const getClaims = vi.fn();
  return { getClaims, createServerClient: vi.fn(() => ({ auth: { getClaims } })) };
});
vi.mock("@supabase/ssr", () => ({ createServerClient }));

import { updateSession } from "./proxy";

function request(path: string) {
  return new NextRequest(`http://localhost:3000${path}`);
}

function signedIn() {
  getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });
}

function signedOut() {
  getClaims.mockResolvedValue({ data: null, error: null });
}

beforeEach(() => {
  getClaims.mockReset();
  createServerClient.mockClear();
  vi.unstubAllEnvs();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

test("로그인하지 않고 화면을 열면 로그인 화면으로 보내고 원래 경로를 next에 담는다", async () => {
  signedOut();

  const response = await updateSession(request("/"));

  expect(response.status).toBe(307);
  const location = new URL(response.headers.get("location")!);
  expect(location.pathname).toBe("/login");
  expect(location.searchParams.get("next")).toBe("/");
});

test("다른 화면 경로와 쿼리도 next로 기억한다", async () => {
  signedOut();

  const response = await updateSession(request("/some/page?x=1"));

  const location = new URL(response.headers.get("location")!);
  expect(location.searchParams.get("next")).toBe("/some/page?x=1");
});

test.each(["/api/chat", "/api/feedback"])(
  "로그인하지 않고 %s 를 부르면 리디렉션 없이 401을 돌려준다",
  async (path) => {
    signedOut();

    const response = await updateSession(request(path));

    expect(response.status).toBe(401);
    expect(response.headers.get("location")).toBeNull();
    expect(await response.json()).toEqual({ error: "unauthorized" });
  },
);

test("로그인하지 않아도 로그인 화면은 그대로 보여 준다", async () => {
  signedOut();

  const response = await updateSession(request("/login"));

  expect(response.status).toBe(200);
  expect(response.headers.get("location")).toBeNull();
});

test("로그인한 사용자는 화면과 API를 그대로 지나간다", async () => {
  signedIn();

  const page = await updateSession(request("/"));
  const api = await updateSession(request("/api/chat"));

  expect(page.status).toBe(200);
  expect(page.headers.get("location")).toBeNull();
  expect(api.status).toBe(200);
});

test("로그인한 사용자가 로그인 화면을 열면 대화 화면으로 보낸다", async () => {
  signedIn();

  const response = await updateSession(request("/login"));

  expect(response.status).toBe(307);
  expect(new URL(response.headers.get("location")!).pathname).toBe("/");
});

test("설정이 없는 개발 환경에서는 Supabase를 부르지 않고 그대로 지나간다", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
  vi.stubEnv("NODE_ENV", "development");

  const response = await updateSession(request("/"));

  expect(response.status).toBe(200);
  expect(createServerClient).not.toHaveBeenCalled();
});

test("설정이 없는 운영 환경에서는 모든 요청을 막는다", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
  vi.stubEnv("NODE_ENV", "production");

  const page = await updateSession(request("/"));
  const login = await updateSession(request("/login"));
  const api = await updateSession(request("/api/chat"));

  expect(page.status).toBe(503);
  expect(login.status).toBe(503);
  expect(api.status).toBe(503);
  expect(createServerClient).not.toHaveBeenCalled();
});

test("Supabase 클라이언트를 만들다 예외가 나면 500 대신 503으로 막고 원인을 로그에 남긴다", async () => {
  createServerClient.mockImplementationOnce(() => {
    throw new Error("Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.");
  });
  const log = vi.spyOn(console, "error").mockImplementation(() => {});

  const response = await updateSession(request("/"));

  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "auth_unavailable" });
  expect(log).toHaveBeenCalledWith(expect.stringContaining("Invalid supabaseUrl"));
  log.mockRestore();
});

test("로그인 정보를 확인하다 예외가 나도 열어 두지 않고 503으로 막는다", async () => {
  getClaims.mockRejectedValue(new Error("fetch failed"));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});

  const page = await updateSession(request("/"));
  const api = await updateSession(request("/api/chat"));

  expect(page.status).toBe(503);
  expect(api.status).toBe(503);
  expect(log).toHaveBeenCalledWith(expect.stringContaining("fetch failed"));
  log.mockRestore();
});

test("로그에는 환경 값 자체를 남기지 않는다", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_SECRETVALUE");
  createServerClient.mockImplementationOnce(() => {
    throw new Error("boom");
  });
  const log = vi.spyOn(console, "error").mockImplementation(() => {});

  await updateSession(request("/"));

  const logged = log.mock.calls.flat().join(" ");
  expect(logged).not.toContain("SECRETVALUE");
  log.mockRestore();
});
