// AC10 1단계: 모델 출력을 앱의 실제 서버 코드(handleFeedback)로 읽고, 심어 둔 오류·깨끗한 문장과 짝지어 채점 입력을 만든다.
// 사용법: bun run score10.ts   (출력이 있는 시도만 처리)
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

import { handleFeedback } from "../../../conversation/server";

const root = import.meta.dir;
const cases = new Map(
  readFileSync(`${root}/ac10-cases.jsonl`, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l)).map((c) => [c.id, c]),
);

process.env.OPENAI_API_KEY = "sk-eval-not-real";
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const covers = (utterance: string, original: string) => {
  const u = norm(utterance), o = norm(original);
  return o.length >= 4 && (u.includes(o) || o.includes(u));
};

const trials: any[] = [];
const judgeItems: any[] = [];
for (const name of readdirSync(`${root}/trials/ac10`).sort()) {
  const out = `${root}/trials/ac10/${name}/output.txt`;
  const id = name.replace(/_rep\d+$/, "");
  const c = cases.get(id);
  if (!c) continue;
  if (!existsSync(out)) { trials.push({ trial: name, status: "no_output" }); continue; }
  const raw = readFileSync(out, "utf8");
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: raw }] }] }), { status: 200 })) as typeof fetch;
  const res = await handleFeedback(new Request("http://x/api/feedback", { method: "POST", body: JSON.stringify({ messages: c.transcript }) }));
  const body: any = await res.json();
  if (res.status !== 200) { trials.push({ trial: name, status: `parse_fail_${res.status}` }); continue; }
  const corrections: { original: string; corrected: string; explanation: string }[] = body.corrections;
  let falseCorrections = 0;
  for (const turn of c.truth.clean) {
    const u = c.transcript[turn].content;
    const hit = corrections.filter((x) => covers(u, x.original));
    if (hit.length > 0) falseCorrections++;
  }
  for (const e of c.truth.errors) {
    const u = c.transcript[e.turn].content;
    const hit = corrections.filter((x) => covers(u, x.original));
    judgeItems.push({
      key: `${name}#${e.turn}`,
      learner_utterance: u,
      planted_error: e.what_is_wrong,
      reference_fix: e.acceptable_fix,
      model_corrections: hit.map((x) => ({ original: x.original, corrected: x.corrected })),
    });
  }
  trials.push({ trial: name, status: "ok", n_corrections: corrections.length, clean_total: c.truth.clean.length, false_corrections: falseCorrections });
}

// 채점자 점검용 대조 항목: 정답 수정 2개(참이어야 함), 엉뚱한 수정 2개(거짓이어야 함)
const controls = [
  { key: "ctrl-good-1", learner_utterance: "I go to office yesterday", planted_error: "past tense and missing article", reference_fix: "I went to the office yesterday", model_corrections: [{ original: "I go to office yesterday", corrected: "I went to the office yesterday" }], expect: true },
  { key: "ctrl-good-2", learner_utterance: "She have two brother", planted_error: "agreement and plural", reference_fix: "She has two brothers", model_corrections: [{ original: "She have two brother", corrected: "She has two brothers." }], expect: true },
  { key: "ctrl-bad-1", learner_utterance: "I go to office yesterday", planted_error: "past tense and missing article", reference_fix: "I went to the office yesterday", model_corrections: [{ original: "I go to office yesterday", corrected: "I go to the office yesterday" }], expect: false },
  { key: "ctrl-bad-2", learner_utterance: "She have two brother", planted_error: "agreement and plural", reference_fix: "She has two brothers", model_corrections: [{ original: "She have two brother", corrected: "She have two brothers" }], expect: false },
];
writeFileSync(`${root}/judge-input-ac10.json`, JSON.stringify({ items: [...judgeItems, ...controls.map(({ expect, ...rest }) => rest)] }, null, 2));
writeFileSync(`${root}/ac10-scored-stage1.json`, JSON.stringify({ trials, controlsExpect: Object.fromEntries(controls.map((c) => [c.key, c.expect])) }, null, 2));
console.log(JSON.stringify(trials));
console.log("judge items:", judgeItems.length, "(+4 controls)");
