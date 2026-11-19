import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

const signInWithPassword = vi.fn();
vi.mock("./supabase-client", () => ({
  createClient: () => ({ auth: { signInWithPassword } }),
}));

import { LoginForm } from "./login-form";

async function submit(email: string, password: string) {
  fireEvent.change(screen.getByLabelText("이메일"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: password } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));
  });
}

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  signInWithPassword.mockReset();
  window.history.pushState({}, "", "/login");
});

test("이메일과 비밀번호로 로그인하면 대화 화면으로 가고 서버 화면을 새로 그린다", async () => {
  signInWithPassword.mockResolvedValue({ error: null });
  render(<LoginForm />);

  await submit("me@example.com", "secret-pass");

  expect(signInWithPassword).toHaveBeenCalledWith({
    email: "me@example.com",
    password: "secret-pass",
  });
  expect(push).toHaveBeenCalledWith("/");
  expect(refresh).toHaveBeenCalled();
});

test("next가 같은 사이트의 경로면 로그인 뒤 그곳으로 간다", async () => {
  window.history.pushState({}, "", "/login?next=%2Fsome%2Fpage");
  signInWithPassword.mockResolvedValue({ error: null });
  render(<LoginForm />);

  await submit("me@example.com", "secret-pass");

  expect(push).toHaveBeenCalledWith("/some/page");
});

test("next가 다른 사이트면 무시하고 대화 화면으로 간다", async () => {
  window.history.pushState({}, "", "/login?next=https%3A%2F%2Fevil.com");
  signInWithPassword.mockResolvedValue({ error: null });
  render(<LoginForm />);

  await submit("me@example.com", "secret-pass");

  expect(push).toHaveBeenCalledWith("/");
});

test("이메일이나 비밀번호가 틀리면 틀린 쪽을 알려 주지 않는 안내만 보이고 이동하지 않는다", async () => {
  signInWithPassword.mockResolvedValue({
    error: { message: "Invalid login credentials", status: 400, code: "invalid_credentials" },
  });
  render(<LoginForm />);

  await submit("me@example.com", "wrong");

  expect(
    await screen.findByText("이메일 또는 비밀번호가 올바르지 않습니다."),
  ).toBeInTheDocument();
  expect(screen.queryByText(/Invalid login credentials/)).not.toBeInTheDocument();
  expect(push).not.toHaveBeenCalled();
});

test("Supabase가 연결 오류를 오류 값으로 돌려줘도 비밀번호가 틀렸다고 안내하지 않는다", async () => {
  signInWithPassword.mockResolvedValue({
    error: { message: "Failed to fetch", status: 0, name: "AuthRetryableFetchError" },
  });
  render(<LoginForm />);

  await submit("me@example.com", "secret-pass");

  expect(
    await screen.findByText("로그인하지 못했습니다. 잠시 후 다시 시도해 주세요."),
  ).toBeInTheDocument();
  expect(screen.queryByText("이메일 또는 비밀번호가 올바르지 않습니다.")).not.toBeInTheDocument();
  expect(push).not.toHaveBeenCalled();
});

test("연결 오류로 로그인하지 못하면 그렇게 안내하고 이동하지 않는다", async () => {
  signInWithPassword.mockRejectedValue(new Error("network down"));
  render(<LoginForm />);

  await submit("me@example.com", "secret-pass");

  expect(await screen.findByText("로그인하지 못했습니다. 잠시 후 다시 시도해 주세요.")).toBeInTheDocument();
  expect(push).not.toHaveBeenCalled();
});

test("회원가입이나 비밀번호 재설정으로 가는 링크가 없다", () => {
  render(<LoginForm />);

  expect(screen.queryByText(/가입|재설정|Sign up|Forgot/i)).not.toBeInTheDocument();
  expect(screen.queryAllByRole("link")).toHaveLength(0);
});
