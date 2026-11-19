"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";

import { describeFailure, requestCorrections, requestReply } from "./client-api";
import { isEndPhrase } from "./end-phrase";
import { pickPersona } from "./personas";
import { createBrowserSpeech, type SpeechPort } from "./speech";
import { countTurns, TURN_GOAL } from "./turns";
import type { Correction, Message, Persona } from "./types";

export interface ConversationViewProps {
  /** 테스트에서 가짜 음성을 주입한다. 기본은 브라우저 Web Speech API. */
  speech?: SpeechPort;
  /** 페르소나 무작위 선택에 쓰는 난수. 기본은 Math.random. */
  random?: () => number;
}

type Phase = "persona" | "chatting" | "feedback";
type Status = "ready" | "listening" | "thinking" | "speaking";

// 지금은 글자 입력으로 쓰려고 마이크 버튼을 화면에서 숨긴다. true로 바꾸면 버튼이 다시 보인다.
const SHOW_MIC_BUTTON = false;

const STATUS_LABEL: Record<Status, string> = {
  ready: SHOW_MIC_BUTTON
    ? "말하기 버튼을 누르고 영어로 말해 보세요."
    : "영어 문장을 입력하고 Enter를 눌러 보내세요.",
  listening: "듣는 중...",
  thinking: "생각하는 중...",
  speaking: "말하는 중...",
};

function listenErrorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  if (code === "no-speech") return "말소리가 들리지 않았습니다. 다시 눌러 주세요.";
  if (code === "unsupported")
    return "이 브라우저는 음성 인식을 지원하지 않습니다. Chrome에서 열어 주세요.";
  if (code === "not-allowed" || code === "service-not-allowed")
    return "마이크 사용이 허용되지 않았습니다. 브라우저 설정에서 마이크를 허용해 주세요.";
  return "음성을 인식하지 못했습니다. 다시 눌러 주세요.";
}

// 구독할 외부 값이 없다. 서버와 브라우저 화면을 구분하는 데만 쓴다.
function subscribeNothing() {
  return () => {};
}

const MUTE_STORAGE_KEY = "conversation:sound-muted";

// 저장소를 못 읽는 브라우저에서는 소리가 켜진 채로 시작한다.
function readMuted(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(MUTE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function ConversationView({ speech, random }: ConversationViewProps) {
  const [speechPort] = useState<SpeechPort>(() => speech ?? createBrowserSpeech());
  const rand = random ?? Math.random;

  const [phase, setPhase] = useState<Phase>("persona");
  // 첫 화면부터 페르소나가 떠 있게 한다. 서버가 그린 화면과 어긋나지 않도록 서버 쪽은 비워 두고
  // 브라우저에서만 처음 고른 페르소나를 보여 준다. 새 대화로 다시 고르면 chosen이 이를 덮는다.
  const [firstPick] = useState(() => pickPersona(rand));
  const initialPersona = useSyncExternalStore(
    subscribeNothing,
    () => firstPick,
    () => null,
  );
  const [chosen, setChosen] = useState<Persona | null>(null);
  const persona = chosen ?? initialPersona;
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<Status>("ready");
  const [error, setError] = useState<string | null>(null);
  const [corrections, setCorrections] = useState<Correction[] | null>(null);
  const [draft, setDraft] = useState("");
  const [muted, setMuted] = useState(readMuted);
  // 응답을 기다리는 사이에 스위치를 바꿔도 그 응답에 적용되도록 ref로도 들고 있는다.
  const mutedRef = useRef(muted);

  // 대화가 바뀌거나 끝난 뒤에 늦게 도착한 응답이 화면을 덮어쓰지 않게 한다.
  const runId = useRef(0);
  // 같은 순간의 연타는 화면 상태가 바뀌기 전에 들어오므로 ref로 바로 막는다.
  const speaking = useRef(false);
  const ending = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [messages, status]);

  const turns = countTurns(messages);
  const goalReached = turns >= TURN_GOAL;

  function chooseNewPersona() {
    runId.current++;
    ending.current = false;
    speechPort.stop?.();
    setChosen(pickPersona(rand));
    setMessages([]);
    setCorrections(null);
    setDraft("");
    setError(null);
    setStatus("ready");
    setPhase("persona");
  }

  async function reply(current: Persona, history: Message[], id: number) {
    setStatus("thinking");
    const text = await requestReply(current.id, history);
    if (id !== runId.current) return;
    setMessages([...history, { role: "assistant", content: text }]);
    if (mutedRef.current) {
      setStatus("ready");
      return;
    }
    setStatus("speaking");
    await speechPort.speak(text).catch(() => {});
    if (id === runId.current) setStatus("ready");
  }

  function changeMuted(next: boolean) {
    mutedRef.current = next;
    setMuted(next);
    try {
      window.localStorage.setItem(MUTE_STORAGE_KEY, next ? "1" : "0");
    } catch {
      // 저장하지 못해도 이번 화면에서는 그대로 동작한다.
    }
    // 말하는 중에 끄면 재생을 멈추고 바로 입력할 수 있게 한다.
    if (next && status === "speaking") {
      speechPort.stop?.();
      setStatus("ready");
    }
  }

  async function startConversation() {
    if (!persona) return;
    const id = ++runId.current;
    setMessages([]);
    setError(null);
    setPhase("chatting");
    try {
      await reply(persona, [], id);
    } catch (failure) {
      if (id !== runId.current) return;
      setError(["응답을 받지 못했습니다.", describeFailure(failure), "잠시 후 대화를 다시 시작해 주세요."].filter(Boolean).join(" "));
      setStatus("ready");
    }
  }

  async function speak() {
    if (!persona || status !== "ready" || speaking.current) return;
    speaking.current = true;
    try {
      const id = runId.current;
      setError(null);
      setStatus("listening");

      let heard: string;
      try {
        heard = await speechPort.listen();
      } catch (listenError) {
        if (id !== runId.current) return;
        setError(listenErrorMessage(listenError));
        setStatus("ready");
        return;
      }
      if (id !== runId.current) return;

      await submitUtterance(persona, heard, id, "다시 말해 주세요.");
    } finally {
      speaking.current = false;
    }
  }

  // 말하든 쓰든 내 한 마디는 같은 길로 처리한다: 종료 문구면 끝내고, 아니면 페르소나의 답을 받는다.
  async function submitUtterance(
    current: Persona,
    text: string,
    id: number,
    retryHint: string,
    onReplyFailed?: () => void,
  ) {
    if (isEndPhrase(text)) {
      await finish();
      return;
    }
    const withUser: Message[] = [...messages, { role: "user", content: text }];
    setMessages(withUser);
    try {
      await reply(current, withUser, id);
    } catch (failure) {
      if (id !== runId.current) return;
      // 답을 못 받은 내 말은 기록에서 빼서 턴이 어긋나지 않게 한다.
      setMessages(messages);
      setError(["응답을 받지 못했습니다.", describeFailure(failure), retryHint].filter(Boolean).join(" "));
      setStatus("ready");
      onReplyFailed?.();
    }
  }

  async function sendText() {
    const text = draft.trim();
    if (!persona || status !== "ready" || speaking.current || text === "") return;
    speaking.current = true;
    try {
      setDraft("");
      setError(null);
      await submitUtterance(persona, text, runId.current, "다시 보내 주세요.", () =>
        setDraft(text),
      );
    } finally {
      speaking.current = false;
    }
  }

  async function finish() {
    if (ending.current) return;
    ending.current = true;
    const id = ++runId.current;
    speechPort.stop?.();
    setStatus("ready");
    setError(null);
    setCorrections(null);
    setPhase("feedback");
    await loadCorrections(messages, id);
  }

  async function loadCorrections(history: Message[], id: number) {
    setError(null);
    try {
      const result = await requestCorrections(history);
      if (id === runId.current) setCorrections(result);
    } catch (failure) {
      if (id === runId.current) setError(["교정을 불러오지 못했습니다.", describeFailure(failure)].filter(Boolean).join(" "));
    }
  }

  if (phase === "persona") {
    return (
      <Card>
        <CardHeader>
          <CardDescription>{persona?.roleKo ?? "영어 회화 연습"}</CardDescription>
          <CardTitle>{persona?.name ?? "대화 상대를 고르는 중..."}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{persona?.situationKo ?? ""}</p>
        </CardContent>
        <CardFooter className="gap-2">
          <Button size="lg" onClick={startConversation} disabled={!persona}>
            대화 시작
          </Button>
          <Button size="lg" variant="outline" onClick={chooseNewPersona}>
            새 대화
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (phase === "chatting" && persona) {
    return (
      <div className="flex flex-1 flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-medium">
              {persona.name}
              <span className="ml-2 text-sm text-muted-foreground">{persona.roleKo}</span>
            </p>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Switch
                  size="sm"
                  aria-label="소리 끄기"
                  checked={muted}
                  onCheckedChange={changeMuted}
                />
                소리 끄기
              </label>
              <p className="text-sm font-medium">
                {goalReached ? `${turns}턴 · 목표 달성` : `${turns}/${TURN_GOAL}`}
              </p>
            </div>
          </div>
          <Progress value={Math.min(turns, TURN_GOAL)} max={TURN_GOAL} />
        </div>

        <ul className="flex flex-1 flex-col gap-3 overflow-y-auto" aria-label="대화 기록">
          {messages.map((message, index) => (
            <li
              key={index}
              className={
                message.role === "user"
                  ? "ml-auto max-w-[85%] rounded-xl bg-primary px-3 py-2 text-primary-foreground"
                  : "mr-auto max-w-[85%] rounded-xl bg-muted px-3 py-2"
              }
            >
              {message.content}
            </li>
          ))}
          <div ref={endRef} />
        </ul>

        {error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {STATUS_LABEL[status]}
        </p>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void sendText();
          }}
        >
          <Input
            aria-label="영어 문장 입력"
            placeholder="영어로 입력하고 Enter"
            autoComplete="off"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={status !== "ready"}
          />
          <Button
            type="submit"
            variant="secondary"
            disabled={status !== "ready" || draft.trim() === ""}
          >
            보내기
          </Button>
        </form>
        <div className="flex gap-2">
          {SHOW_MIC_BUTTON && (
            <Button size="lg" className="flex-1" onClick={speak} disabled={status !== "ready"}>
              말하기
            </Button>
          )}
          <Button size="lg" variant="outline" className="flex-1" onClick={finish}>
            종료
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="font-heading text-lg font-medium">교정</h2>
        <CardDescription>이번 대화에서 내가 한 문장을 고쳐 봤습니다.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {!error && corrections === null && (
          <p className="text-muted-foreground">교정하는 중...</p>
        )}
        {corrections !== null && corrections.length === 0 && (
          <p>고칠 문장이 없습니다</p>
        )}
        {corrections?.map((correction, index) => (
          <div key={index} className="flex flex-col gap-1 rounded-lg border p-3">
            <p className="text-muted-foreground line-through">{correction.original}</p>
            <p className="font-medium">{correction.corrected}</p>
            <p className="text-sm text-muted-foreground">{correction.explanation}</p>
          </div>
        ))}
      </CardContent>
      <CardFooter className="gap-2">
        <Button size="lg" onClick={chooseNewPersona}>
          새 대화
        </Button>
        {error && (
          <Button
            size="lg"
            variant="outline"
            onClick={() => loadCorrections(messages, runId.current)}
          >
            다시 시도
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
