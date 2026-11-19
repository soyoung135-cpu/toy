import { expect, test } from "vitest";

import { isEndPhrase } from "./end-phrase";

test.each([
  "Let's stop here",
  "Let's stop here.",
  "I'm done",
  "I'm done.",
  "Let's finish",
  "let's finish!",
  "Let’s stop here",
  "  I’m done  ",
])("종료 문구 %j 는 대화를 끝낸다", (text) => {
  expect(isEndPhrase(text)).toBe(true);
});

test.each([
  "",
  "I'm done with my homework already, and you?",
  "Let's stop at the cafe on the way",
  "I went to the office yesterday",
])("일반 문장 %j 는 대화를 끝내지 않는다", (text) => {
  expect(isEndPhrase(text)).toBe(false);
});
