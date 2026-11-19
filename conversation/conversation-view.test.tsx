import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { ConversationView } from "./conversation-view";
import type { SpeechPort } from "./speech";

type Json = Record<string, unknown>;

let chatCalls: Json[];
let feedbackCalls: Json[];
let chatReplies: (string | "FAIL" | "HOLD")[];
// "HOLD" 응답은 releaseHold()를 부를 때까지 붙잡아 둔다.
let releaseHold: (() => void) | null;
// 교정 요청을 "<상태>:<오류 코드>"로 실패시킨다.
let feedbackFailure: string | null;
let corrections: { original: string; corrected: string; explanation: string }[];

function stubApi() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as Json;
      if (url === "/api/chat") {
        chatCalls.push(body);
        const next = chatReplies.shift() ?? `reply ${chatCalls.length}`;
        if (next === "THROW") throw new TypeError("Failed to fetch");
        if (next === "HTML") {
          // 서버가 JSON이 아닌 본문(예: 오류 페이지)을 200으로 돌려주는 경우
          return new Response("<html>oops</html>", { status: 200 });
        }
        if (next === "FAIL") return Response.json({ error: "x" }, { status: 502 });
        if (next.startsWith("FAIL:")) {
          // "FAIL:<상태>:<오류 코드>" 형태로 서버가 돌려주는 실패를 흉내 낸다.
          const [, status, code] = next.split(":");
          return Response.json({ error: code }, { status: Number(status) });
        }
        if (next === "HOLD") {
          await new Promise<void>((resolve) => {
            releaseHold = resolve;
          });
          return Response.json({ reply: "held reply" });
        }
        return Response.json({ reply: next });
      }
      if (url === "/api/feedback") {
        feedbackCalls.push(body);
        if (feedbackFailure) {
          const [status, code] = feedbackFailure.split(":");
          return Response.json({ error: code }, { status: Number(status) });
        }
        return Response.json({ corrections });
      }
      throw new Error(`unexpected ${url}`);
    }),
  );
}

function fakeSpeech(lines: (string | Error)[] = []) {
  const queue = [...lines];
  const speech = {
    listen: vi.fn(async () => {
      const next = queue.shift() ?? "I like it";
      if (next instanceof Error) throw next;
      return next;
    }),
    speak: vi.fn(async () => {}),
  };
  return speech satisfies SpeechPort;
}

// 외부 의존성을 늘리지 않으려고 user-event 대신 fireEvent로 클릭을 흉내 낸다.
function createUser() {
  return {
    click: async (element: HTMLElement) => {
      await act(async () => {
        fireEvent.click(element);
      });
    },
  };
}

function setup(speech = fakeSpeech(), random: () => number = () => 0) {
  const user = createUser();
  render(<ConversationView speech={speech} random={random} />);
  return { user, speech };
}

async function startConversation(user: ReturnType<typeof createUser>) {
  await user.click(screen.getByRole("button", { name: "새 대화" }));
  await user.click(screen.getByRole("button", { name: "대화 시작" }));
  await screen.findByText("reply 1");
}

async function say(user: ReturnType<typeof createUser>) {
  const button = screen.getByRole("button", { name: "말하기" });
  // 페르소나가 말하는 동안에는 눌러도 반응하지 않으므로 켜질 때까지 기다린다.
  await waitFor(() => expect(button).toBeEnabled());
  await user.click(button);
}

beforeEach(() => {
  window.localStorage.clear();
  releaseHold = null;
  feedbackFailure = null;
  chatCalls = [];
  feedbackCalls = [];
  chatReplies = [];
  corrections = [];
  stubApi();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("새 대화를 누르면 페르소나의 역할, 이름, 상황이 보인다", async () => {
  const { user } = setup();

  await user.click(screen.getByRole("button", { name: "새 대화" }));

  expect(screen.getByText("Emma")).toBeInTheDocument();
  expect(screen.getByText("Hotel front desk clerk")).toBeInTheDocument();
  expect(screen.getByText(/can't find your reservation/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "대화 시작" })).toBeInTheDocument();
});

test("새 대화를 다시 누르면 무작위 값에 따라 다른 페르소나가 뜬다", async () => {
  const values = [0, 0.999];
  const { user } = setup(fakeSpeech(), () => values.shift() ?? 0);

  await user.click(screen.getByRole("button", { name: "새 대화" }));
  expect(screen.getByText("Emma")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "새 대화" }));

  expect(screen.queryByText("Emma")).not.toBeInTheDocument();
  expect(screen.getByText("Sarah")).toBeInTheDocument();
});

test("대화를 시작하면 페르소나의 첫 영어 발화가 글자로 보이고 소리로 재생된다", async () => {
  chatReplies = ["Hello, I'm Emma."];
  const { user, speech } = setup();

  await user.click(screen.getByRole("button", { name: "새 대화" }));
  await user.click(screen.getByRole("button", { name: "대화 시작" }));

  expect(await screen.findByText("Hello, I'm Emma.")).toBeInTheDocument();
  expect(speech.speak).toHaveBeenCalledWith("Hello, I'm Emma.");
  expect(chatCalls[0]).toEqual({ personaId: "hotel-front-desk", messages: [] });
  expect(screen.getByText("0/20")).toBeInTheDocument();
});

test("내가 말하면 받아 적은 문장과 페르소나의 답이 글자와 소리로 나오고 턴이 1 늘어난다", async () => {
  chatReplies = ["Hello!", "Sure, what's your name?"];
  const { user, speech } = setup(fakeSpeech(["I have a reservation"]));
  await user.click(screen.getByRole("button", { name: "새 대화" }));
  await user.click(screen.getByRole("button", { name: "대화 시작" }));
  await screen.findByText("Hello!");

  await say(user);

  expect(await screen.findByText("I have a reservation")).toBeInTheDocument();
  expect(await screen.findByText("Sure, what's your name?")).toBeInTheDocument();
  expect(speech.speak).toHaveBeenLastCalledWith("Sure, what's your name?");
  expect(screen.getByText("1/20")).toBeInTheDocument();
  expect(chatCalls[1].messages).toEqual([
    { role: "assistant", content: "Hello!" },
    { role: "user", content: "I have a reservation" },
  ]);
});

test("20턴이 되면 목표 달성이 표시되고, 더 말하면 21턴으로 이어진다", async () => {
  const { user } = setup();
  await startConversation(user);

  for (let turn = 1; turn <= 19; turn++) {
    await say(user);
    await screen.findByText(`${turn}/20`);
  }
  expect(screen.queryByText(/목표 달성/)).not.toBeInTheDocument();

  await say(user);
  expect(await screen.findByText("20턴 · 목표 달성")).toBeInTheDocument();

  await say(user);
  expect(await screen.findByText("21턴 · 목표 달성")).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: /교정/ })).not.toBeInTheDocument();
});

test.each(["Let's stop here", "I'm done", "Let's finish"])(
  "영어 종료 문구 %s 를 말하면 대화가 끝나고 교정 화면으로 간다",
  async (phrase) => {
    const { user } = setup(fakeSpeech([phrase]));
    await startConversation(user);

    await say(user);

    expect(await screen.findByRole("heading", { name: "교정" })).toBeInTheDocument();
    expect(feedbackCalls).toHaveLength(1);
    expect(chatCalls).toHaveLength(1);
  },
);

test("종료 버튼을 눌러도 교정 화면으로 간다", async () => {
  const { user } = setup();
  await startConversation(user);

  await user.click(screen.getByRole("button", { name: "종료" }));

  expect(await screen.findByRole("heading", { name: "교정" })).toBeInTheDocument();
});

test("종료 문구가 아닌 일반 문장은 대화를 끝내지 않는다", async () => {
  const { user } = setup(
    fakeSpeech(["I'm done with my homework already, and you?"]),
  );
  await startConversation(user);

  await say(user);

  expect(await screen.findByText("1/20")).toBeInTheDocument();
  expect(feedbackCalls).toHaveLength(0);
  expect(screen.queryByRole("heading", { name: "교정" })).not.toBeInTheDocument();
});

test("대화 중에는 교정이나 교정 요청이 나타나지 않는다", async () => {
  corrections = [{ original: "a", corrected: "b", explanation: "c" }];
  const { user } = setup(fakeSpeech(["I go to office yesterday"]));
  await startConversation(user);

  await say(user);
  await screen.findByText("1/20");

  expect(feedbackCalls).toHaveLength(0);
  expect(screen.queryByText(/교정/)).not.toBeInTheDocument();
});

test("교정 화면에는 고칠 문장마다 원래 문장, 고친 문장, 한국어 설명이 보인다", async () => {
  corrections = [
    {
      original: "I go to office yesterday",
      corrected: "I went to the office yesterday",
      explanation: "yesterday가 있으므로 과거형 went를 씁니다.",
    },
  ];
  const { user } = setup(fakeSpeech(["I go to office yesterday"]));
  await startConversation(user);
  await say(user);
  await screen.findByText("1/20");

  await user.click(screen.getByRole("button", { name: "종료" }));

  await screen.findByRole("heading", { name: "교정" });
  expect(screen.getByText("I go to office yesterday")).toBeInTheDocument();
  expect(screen.getByText("I went to the office yesterday")).toBeInTheDocument();
  expect(
    screen.getByText("yesterday가 있으므로 과거형 went를 씁니다."),
  ).toBeInTheDocument();
  expect(feedbackCalls[0].messages).toEqual([
    { role: "assistant", content: "reply 1" },
    { role: "user", content: "I go to office yesterday" },
    { role: "assistant", content: "reply 2" },
  ]);
});

test("고칠 것이 없으면 없다고 표시한다", async () => {
  corrections = [];
  const { user } = setup();
  await startConversation(user);

  await user.click(screen.getByRole("button", { name: "종료" }));

  expect(await screen.findByText("고칠 문장이 없습니다")).toBeInTheDocument();
});

test("교정 화면에서 새 대화를 시작하면 페르소나 선택 상태로 돌아간다", async () => {
  const { user } = setup();
  await startConversation(user);
  await user.click(screen.getByRole("button", { name: "종료" }));
  await screen.findByRole("heading", { name: "교정" });

  await user.click(screen.getByRole("button", { name: "새 대화" }));

  expect(screen.getByRole("button", { name: "대화 시작" })).toBeInTheDocument();
  expect(screen.getByText("Emma")).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "교정" })).not.toBeInTheDocument();
});

test("말하기 버튼을 같은 순간에 두 번 눌러도 듣기는 한 번만 시작된다", async () => {
  const { user, speech } = setup(fakeSpeech(["First", "Second"]));
  await startConversation(user);
  const button = screen.getByRole("button", { name: "말하기" });
  await waitFor(() => expect(button).toBeEnabled());

  await act(async () => {
    button.click();
    button.click();
  });

  await screen.findByText("1/20");
  expect(speech.listen).toHaveBeenCalledTimes(1);
  expect(screen.getByText("First")).toBeInTheDocument();
  expect(chatCalls).toHaveLength(2);
});

test("종료 버튼을 같은 순간에 두 번 눌러도 교정 요청은 한 번만 나간다", async () => {
  const { user } = setup();
  await startConversation(user);
  const button = screen.getByRole("button", { name: "종료" });

  await act(async () => {
    button.click();
    button.click();
  });

  await screen.findByRole("heading", { name: "교정" });
  expect(feedbackCalls).toHaveLength(1);
});

test("말소리가 인식되지 않으면 안내가 보이고 턴은 늘지 않는다", async () => {
  const { user } = setup(fakeSpeech([new Error("no-speech")]));
  await startConversation(user);

  await say(user);

  expect(await screen.findByText(/말소리가 들리지 않았습니다/)).toBeInTheDocument();
  expect(screen.getByText("0/20")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "말하기" })).toBeEnabled();
});

test("페르소나의 답을 받지 못하면 안내가 보이고 내 말은 기록에서 빠진다", async () => {
  chatReplies = ["Hello!", "FAIL"];
  const { user } = setup(fakeSpeech(["I will fail"]));
  await user.click(screen.getByRole("button", { name: "새 대화" }));
  await user.click(screen.getByRole("button", { name: "대화 시작" }));
  await screen.findByText("Hello!");

  await say(user);

  expect(await screen.findByText(/응답을 받지 못했습니다/)).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByText("I will fail")).not.toBeInTheDocument());
  expect(screen.getByText("0/20")).toBeInTheDocument();
});

// ---- 글자 입력 (AC12) ----

function textBox() {
  return screen.getByLabelText("영어 문장 입력") as HTMLInputElement;
}

async function typeText(text: string) {
  await act(async () => {
    fireEvent.change(textBox(), { target: { value: text } });
  });
}

async function submitForm() {
  await act(async () => {
    fireEvent.submit(textBox().closest("form")!);
  });
}

test("입력창에 쓴 문장을 보내면 말한 것과 똑같이 처리되고 입력창이 비워지며 음성 인식은 시작되지 않는다", async () => {
  chatReplies = ["Hello!", "Nice to meet you, Kim."];
  const { user, speech } = setup();
  await user.click(screen.getByRole("button", { name: "새 대화" }));
  await user.click(screen.getByRole("button", { name: "대화 시작" }));
  await screen.findByText("Hello!");
  await waitFor(() => expect(textBox()).toBeEnabled());

  await typeText("I have a reservation under Kim");
  await submitForm();

  expect(await screen.findByText("I have a reservation under Kim")).toBeInTheDocument();
  expect(await screen.findByText("Nice to meet you, Kim.")).toBeInTheDocument();
  expect(screen.getByText("1/20")).toBeInTheDocument();
  expect(speech.speak).toHaveBeenLastCalledWith("Nice to meet you, Kim.");
  expect(speech.listen).not.toHaveBeenCalled();
  expect(textBox().value).toBe("");
  expect(chatCalls[1].messages).toEqual([
    { role: "assistant", content: "Hello!" },
    { role: "user", content: "I have a reservation under Kim" },
  ]);
});

test("보내기 버튼을 눌러도 보내진다", async () => {
  const { user } = setup();
  await startConversation(user);
  await waitFor(() => expect(textBox()).toBeEnabled());

  await typeText("I like it here");
  await user.click(screen.getByRole("button", { name: "보내기" }));

  expect(await screen.findByText("1/20")).toBeInTheDocument();
  expect(screen.getByText("I like it here")).toBeInTheDocument();
});

test("공백뿐인 입력은 보내지지 않는다", async () => {
  const { user } = setup();
  await startConversation(user);
  await waitFor(() => expect(textBox()).toBeEnabled());

  await typeText("   ");
  await submitForm();

  expect(chatCalls).toHaveLength(1);
  expect(screen.getByText("0/20")).toBeInTheDocument();
});

test("입력창에 종료 문구를 써서 보내면 교정 화면으로 간다", async () => {
  const { user } = setup();
  await startConversation(user);
  await waitFor(() => expect(textBox()).toBeEnabled());

  await typeText("I'm done");
  await submitForm();

  expect(await screen.findByRole("heading", { name: "교정" })).toBeInTheDocument();
  expect(feedbackCalls).toHaveLength(1);
  expect(chatCalls).toHaveLength(1);
});

test("페르소나의 답을 기다리는 동안에는 입력창과 보내기가 막힌다", async () => {
  chatReplies = ["Hello!", "HOLD"];
  const { user } = setup();
  await user.click(screen.getByRole("button", { name: "새 대화" }));
  await user.click(screen.getByRole("button", { name: "대화 시작" }));
  await screen.findByText("Hello!");
  await waitFor(() => expect(textBox()).toBeEnabled());

  await typeText("Please wait for me");
  await submitForm();

  await waitFor(() => expect(textBox()).toBeDisabled());
  expect(screen.getByRole("button", { name: "보내기" })).toBeDisabled();

  await act(async () => {
    releaseHold?.();
  });
  expect(await screen.findByText("held reply")).toBeInTheDocument();
  await waitFor(() => expect(textBox()).toBeEnabled());
});

test("같은 순간에 두 번 보내도 한 번만 처리된다", async () => {
  const { user } = setup();
  await startConversation(user);
  await waitFor(() => expect(textBox()).toBeEnabled());
  await typeText("Only once please");
  const form = textBox().closest("form")!;

  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });

  await screen.findByText("1/20");
  expect(chatCalls).toHaveLength(2);
  expect(screen.getAllByText("Only once please")).toHaveLength(1);
});

test("답을 받지 못하면 입력했던 문장이 입력창에 돌아온다", async () => {
  chatReplies = ["Hello!", "FAIL"];
  const { user } = setup();
  await user.click(screen.getByRole("button", { name: "새 대화" }));
  await user.click(screen.getByRole("button", { name: "대화 시작" }));
  await screen.findByText("Hello!");
  await waitFor(() => expect(textBox()).toBeEnabled());

  await typeText("This will fail");
  await submitForm();

  expect(await screen.findByText(/응답을 받지 못했습니다/)).toBeInTheDocument();
  await waitFor(() => expect(textBox().value).toBe("This will fail"));
  expect(screen.getByText("0/20")).toBeInTheDocument();
});

// ---- 소리 끄기 (AC13) ----

const MUTE_KEY = "conversation:sound-muted";

function muteSwitch() {
  return screen.getByRole("switch", { name: "소리 끄기" });
}

async function toggleMute() {
  await act(async () => {
    fireEvent.click(muteSwitch());
  });
}

test("저장된 설정이 소리 끄기면 첫 인사도 소리 없이 글자로만 나오고 곧바로 입력할 수 있다", async () => {
  window.localStorage.setItem(MUTE_KEY, "1");
  chatReplies = ["Hello, quietly."];
  const { user, speech } = setup();

  await user.click(screen.getByRole("button", { name: "새 대화" }));
  await user.click(screen.getByRole("button", { name: "대화 시작" }));

  expect(await screen.findByText("Hello, quietly.")).toBeInTheDocument();
  expect(speech.speak).not.toHaveBeenCalled();
  expect(muteSwitch()).toHaveAttribute("aria-checked", "true");
  await waitFor(() => expect(textBox()).toBeEnabled());
  expect(screen.queryByText("말하는 중...")).not.toBeInTheDocument();
});

test("대화 중에 소리 끄기를 켜면 다음 답은 글자로만 나오고, 끄면 다시 소리가 난다", async () => {
  chatReplies = ["Hello!", "Quiet reply.", "Loud reply."];
  const { user, speech } = setup();
  await user.click(screen.getByRole("button", { name: "새 대화" }));
  await user.click(screen.getByRole("button", { name: "대화 시작" }));
  await screen.findByText("Hello!");
  await waitFor(() => expect(textBox()).toBeEnabled());
  expect(speech.speak).toHaveBeenCalledTimes(1);

  await toggleMute();
  await typeText("One");
  await submitForm();
  expect(await screen.findByText("Quiet reply.")).toBeInTheDocument();
  expect(speech.speak).toHaveBeenCalledTimes(1);
  expect(textBox()).toBeEnabled();

  await toggleMute();
  await typeText("Two");
  await submitForm();
  expect(await screen.findByText("Loud reply.")).toBeInTheDocument();
  expect(speech.speak).toHaveBeenLastCalledWith("Loud reply.");
});

test("페르소나가 말하는 중에 소리 끄기를 켜면 재생이 멈추고 곧바로 입력할 수 있다", async () => {
  const { user, speech } = setup();
  const stop = vi.fn();
  (speech as SpeechPort).stop = stop;
  speech.speak = vi.fn(() => new Promise<void>(() => {})); // 끝나지 않는 재생
  await user.click(screen.getByRole("button", { name: "새 대화" }));
  await user.click(screen.getByRole("button", { name: "대화 시작" }));
  await screen.findByText("reply 1");
  await waitFor(() => expect(screen.getByText("말하는 중...")).toBeInTheDocument());
  expect(textBox()).toBeDisabled();

  await toggleMute();

  expect(stop).toHaveBeenCalled();
  await waitFor(() => expect(textBox()).toBeEnabled());
});

test("소리 끄기 설정은 새 대화로 넘어가도 새로고침해도 유지된다", async () => {
  const { user } = setup();
  await startConversation(user);
  await toggleMute();
  expect(window.localStorage.getItem(MUTE_KEY)).toBe("1");

  await user.click(screen.getByRole("button", { name: "종료" }));
  await screen.findByRole("heading", { name: "교정" });
  await user.click(screen.getByRole("button", { name: "새 대화" }));
  await user.click(screen.getByRole("button", { name: "대화 시작" }));
  await screen.findByText("reply 2");
  expect(muteSwitch()).toHaveAttribute("aria-checked", "true");

  cleanup(); // 새로고침처럼 화면을 새로 만든다
  const second = setup();
  await second.user.click(screen.getByRole("button", { name: "새 대화" }));
  await second.user.click(screen.getByRole("button", { name: "대화 시작" }));
  await screen.findByText(/reply/);
  expect(muteSwitch()).toHaveAttribute("aria-checked", "true");
  expect(second.speech.speak).not.toHaveBeenCalled();
});

test("저장소를 쓸 수 없어도 소리 끄기는 동작한다", async () => {
  const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("denied");
  });
  const { user, speech } = setup();
  await startConversation(user);
  await waitFor(() => expect(textBox()).toBeEnabled());

  await toggleMute();
  await typeText("Hi");
  await submitForm();

  expect(await screen.findByText("1/20")).toBeInTheDocument();
  expect(speech.speak).toHaveBeenCalledTimes(1); // 첫 인사 때만
  setItem.mockRestore();
});

// ---- 실패 이유 안내 ----

const FAILURE_CASES: [string, string][] = [
  ["FAIL:503:llm_not_configured", "OpenAI 키"],
  ["FAIL:502:upstream_failed", "AI 서비스"],
  ["FAIL:401:unauthorized", "다시 로그인"],
];

test.each(FAILURE_CASES)(
  "대화를 시작할 때 응답이 %s 로 실패하면 이유를 화면에 알려 준다",
  async (reply, reason) => {
    chatReplies = [reply];
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "새 대화" }));
    await user.click(screen.getByRole("button", { name: "대화 시작" }));

    const message = await screen.findByText(/응답을 받지 못했습니다/);
    expect(message).toHaveTextContent(reason);
  },
);

test.each(FAILURE_CASES)(
  "말한 뒤 응답이 %s 로 실패하면 이유를 화면에 알려 준다",
  async (reply, reason) => {
    chatReplies = ["Hello!", reply];
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "새 대화" }));
    await user.click(screen.getByRole("button", { name: "대화 시작" }));
    await screen.findByText("Hello!");
    await waitFor(() => expect(textBox()).toBeEnabled());

    await typeText("This will fail");
    await submitForm();

    const message = await screen.findByText(/응답을 받지 못했습니다/);
    expect(message).toHaveTextContent(reason);
  },
);

test("알 수 없는 오류 코드는 이유를 지어내지 않고 서버 응답 코드만 알려 준다", async () => {
  chatReplies = ["FAIL:500:something_else"];
  const { user } = setup();

  await user.click(screen.getByRole("button", { name: "새 대화" }));
  await user.click(screen.getByRole("button", { name: "대화 시작" }));

  const message = await screen.findByText(/응답을 받지 못했습니다/);
  expect(message).toHaveTextContent("서버 응답 코드 500");
  expect(message).not.toHaveTextContent("OpenAI");
  expect(message).not.toHaveTextContent("로그인");
});

test("서버에 연결하지 못하면 그 사실을 알려 준다", async () => {
  chatReplies = ["THROW"];
  const { user } = setup();

  await user.click(screen.getByRole("button", { name: "새 대화" }));
  await user.click(screen.getByRole("button", { name: "대화 시작" }));

  const message = await screen.findByText(/응답을 받지 못했습니다/);
  expect(message).toHaveTextContent("서버에 연결하지 못했습니다");
});

test("서버가 JSON이 아닌 응답을 보내면 서버 응답 코드와 함께 그 사실을 알려 준다", async () => {
  chatReplies = ["HTML"];
  const { user } = setup();

  await user.click(screen.getByRole("button", { name: "새 대화" }));
  await user.click(screen.getByRole("button", { name: "대화 시작" }));

  const message = await screen.findByText(/응답을 받지 못했습니다/);
  expect(message).toHaveTextContent("알 수 없는 응답");
  expect(message).toHaveTextContent("서버 응답 코드 200");
});

test("교정이 키 누락으로 실패하면 이유를 화면에 알려 준다", async () => {
  feedbackFailure = "503:llm_not_configured";
  const { user } = setup();
  await startConversation(user);

  await user.click(screen.getByRole("button", { name: "종료" }));

  const message = await screen.findByText(/교정을 불러오지 못했습니다/);
  expect(message).toHaveTextContent("OpenAI 키");
});
