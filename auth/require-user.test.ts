// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const getClaims = vi.fn();
vi.mock("./supabase-server", () => ({
  createServerSupabase: vi.fn(async () => ({ auth: { getClaims } })),
}));

import { requireUser } from "./require-user";

beforeEach(() => {
  getClaims.mockReset();
  vi.unstubAllEnvs();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

test("설정이 있고 로그인하지 않았으면 401 응답을 돌려준다", async () => {
  getClaims.mockResolvedValue({ data: null, error: null });

  const denied = await requireUser();

  expect(denied?.status).toBe(401);
  expect(await denied?.json()).toEqual({ error: "unauthorized" });
});

test("로그인 정보 확인이 오류를 내면 401로 막는다", async () => {
  getClaims.mockResolvedValue({ data: null, error: new Error("bad jwt") });

  const denied = await requireUser();

  expect(denied?.status).toBe(401);
});

test("설정이 있고 로그인했으면 막지 않는다", async () => {
  getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });

  expect(await requireUser()).toBeNull();
});

test("설정이 없는 개발 환경에서는 확인하지 않고 지나간다", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
  vi.stubEnv("NODE_ENV", "development");

  expect(await requireUser()).toBeNull();
  expect(getClaims).not.toHaveBeenCalled();
});

test("설정이 없는 운영 환경에서는 503으로 막는다", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
  vi.stubEnv("NODE_ENV", "production");

  const denied = await requireUser();

  expect(denied?.status).toBe(503);
  expect(getClaims).not.toHaveBeenCalled();
});
