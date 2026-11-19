import { render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/auth/supabase-client", () => ({
  createClient: () => ({ auth: { signOut: vi.fn() } }),
}));

import Home from "@/app/page";

afterEach(() => {
  vi.unstubAllEnvs();
});

test("홈 화면은 새 대화를 시작할 수 있는 버튼을 보여준다", () => {
  render(<Home />);

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
