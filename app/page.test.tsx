import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/auth/supabase-client", () => ({
  createClient: () => ({ auth: { signOut: vi.fn() } }),
}));

// 임시 로그인 우회 스위치. 로그아웃 버튼 표시를 검증하는 테스트는 꺼 둔 채로 돌린다.
const bypass = vi.hoisted(() => ({ disabled: false }));
vi.mock("@/auth/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/auth/config")>()),
  isLoginDisabled: () => bypass.disabled,
}));

import Home from "@/app/page";

beforeEach(() => {
  bypass.disabled = false;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

test("홈 화면은 처음부터 대화 시작과 새 대화 버튼을 함께 보여준다", () => {
  render(<Home />);

  expect(screen.getByRole("button", { name: "대화 시작" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "새 대화" })).toBeInTheDocument();
});

test("Supabase 설정이 없으면 로그아웃 버튼을 보여주지 않는다", () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");

  render(<Home />);

  expect(screen.queryByRole("button", { name: "로그아웃" })).not.toBeInTheDocument();
});

test("Supabase 설정이 있으면 대화 화면 위에 로그아웃 버튼을 보여준다", () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");

  render(<Home />);

  expect(screen.getByRole("button", { name: "로그아웃" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "새 대화" })).toBeInTheDocument();
});

test("로그인 우회가 켜져 있으면 Supabase 설정이 있어도 로그아웃 버튼 없이 대화 화면만 보여준다", () => {
  bypass.disabled = true;
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");

  render(<Home />);

  expect(screen.queryByRole("button", { name: "로그아웃" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "대화 시작" })).toBeInTheDocument();
});
