import { expect, test } from "vitest";

import { countTurns, hasReachedGoal, TURN_GOAL } from "./turns";
import type { Message } from "./types";

function conversation(pairs: number): Message[] {
  const messages: Message[] = [{ role: "assistant", content: "Hello!" }];
  for (let i = 0; i < pairs; i++) {
    messages.push({ role: "user", content: `me ${i}` });
    messages.push({ role: "assistant", content: `persona ${i}` });
  }
  return messages;
}

test("목표 턴은 20이다", () => {
  expect(TURN_GOAL).toBe(20);
});

test("페르소나의 첫 인사만 있으면 0턴이다", () => {
  expect(countTurns([])).toBe(0);
  expect(countTurns(conversation(0))).toBe(0);
});

test("내가 말했어도 페르소나가 아직 답하지 않았으면 턴이 늘지 않는다", () => {
  const messages = [...conversation(2), { role: "user", content: "pending" } as Message];
  expect(countTurns(messages)).toBe(2);
});

test("내가 한 번 말하고 페르소나가 한 번 답하면 1턴이다", () => {
  expect(countTurns(conversation(1))).toBe(1);
  expect(countTurns(conversation(7))).toBe(7);
});

test("20턴째에 목표 달성이 되고 그 이후에도 유지된다", () => {
  expect(hasReachedGoal(conversation(19))).toBe(false);
  expect(hasReachedGoal(conversation(20))).toBe(true);
  expect(hasReachedGoal(conversation(21))).toBe(true);
  expect(countTurns(conversation(21))).toBe(21);
});
