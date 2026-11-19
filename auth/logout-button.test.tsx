import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

const signOut = vi.fn();
vi.mock("./supabase-client", () => ({
  createClient: () => ({ auth: { signOut } }),
}));

import { LogoutButton } from "./logout-button";

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  signOut.mockReset();
  signOut.mockResolvedValue({ error: null });
});

test("로그아웃을 누르면 세션을 끝내고 로그인 화면으로 가며 서버 화면을 새로 그린다", async () => {
  render(<LogoutButton />);

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));
  });

  expect(signOut).toHaveBeenCalledTimes(1);
  expect(push).toHaveBeenCalledWith("/login");
  expect(refresh).toHaveBeenCalled();
});
