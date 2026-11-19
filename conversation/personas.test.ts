import { expect, test } from "vitest";

import { PERSONAS, pickPersona } from "./personas";

test("미리 저장된 페르소나는 5개이고 각각 역할, 이름, 상황을 가진다", () => {
  expect(PERSONAS).toHaveLength(5);
  for (const persona of PERSONAS) {
    expect(persona.role).not.toBe("");
    expect(persona.name).not.toBe("");
    expect(persona.situation).not.toBe("");
  }
});

test("화면에 보이는 역할과 상황은 한국어로 적혀 있다", () => {
  const hangul = /[가-힣]/;
  for (const persona of PERSONAS) {
    expect(persona.roleKo).toMatch(hangul);
    expect(persona.situationKo).toMatch(hangul);
  }
});

test("무작위 값이 다르면 서로 다른 페르소나가 골라진다", () => {
  const first = pickPersona(() => 0);
  const last = pickPersona(() => 0.999999);

  expect(first.id).not.toBe(last.id);
  expect(PERSONAS.map((p) => p.id)).toContain(first.id);
  expect(PERSONAS.map((p) => p.id)).toContain(last.id);
});

test("페르소나 id는 서로 겹치지 않는다", () => {
  const ids = PERSONAS.map((p) => p.id);
  expect(new Set(ids).size).toBe(ids.length);
});
