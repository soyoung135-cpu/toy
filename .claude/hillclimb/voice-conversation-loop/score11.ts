// AC11 1단계: 페르소나 출력(JSON 배열)을 읽어 채점자 입력을 만든다. 그 다음 final11.ts가 판정을 합산한다.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

const root = import.meta.dir;
const cases = new Map(
  readFileSync(`${root}/ac11-cases.jsonl`, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l)).map((c) => [c.id, c]),
);

const items: any[] = [];
const trials: any[] = [];
for (const name of readdirSync(`${root}/trials/ac11`).sort()) {
  const out = `${root}/trials/ac11/${name}/output.json`;
  const id = name.replace(/_rep\d+$/, "");
  const c = cases.get(id);
  if (!c) continue;
  if (!existsSync(out)) { trials.push({ trial: name, status: "no_output" }); continue; }
  let replies: unknown;
  try { replies = JSON.parse(readFileSync(out, "utf8")); } catch { trials.push({ trial: name, status: "bad_json" }); continue; }
  if (!Array.isArray(replies) || replies.length !== c.learner_lines.length + 1 || replies.some((r) => typeof r !== "string")) {
    trials.push({ trial: name, status: "bad_shape" });
    continue;
  }
  (replies as string[]).forEach((r, i) => {
    items.push({ key: `${name}#${i}`, learner_said: i === 0 ? null : c.learner_lines[i - 1], partner_reply: r });
  });
  trials.push({ trial: name, status: "ok", replies: replies.length });
}
const controls = [
  { key: "ctrl-break-1", learner_said: "I have reservation under name Kim.", partner_reply: "You should say 'a reservation' and 'under the name Kim'. Now, let me check.", expect: true },
  { key: "ctrl-break-2", learner_said: "I am very tired because I go flight long time.", partner_reply: "That is a very good sentence! Your grammar is improving. Let me check the system.", expect: true },
  { key: "ctrl-ok-1", learner_said: "I have reservation under name Kim.", partner_reply: "Of course, Mr. Kim. Let me check the system for you. Could you spell your last name?", expect: false },
  { key: "ctrl-ok-2", learner_said: "Can I get oat milk instead of normal milk?", partner_reply: "Sure, we have oat milk. Would you like it in a small, medium or large cup?", expect: false },
];
writeFileSync(`${root}/judge-input-ac11.json`, JSON.stringify({ items: [...items, ...controls.map(({ expect, ...r }) => r)] }, null, 2));
writeFileSync(`${root}/ac11-scored-stage1.json`, JSON.stringify({ trials, controlsExpect: Object.fromEntries(controls.map((c) => [c.key, c.expect])) }, null, 2));
console.log(JSON.stringify(trials));
console.log("judge items:", items.length, "(+4 controls)");
