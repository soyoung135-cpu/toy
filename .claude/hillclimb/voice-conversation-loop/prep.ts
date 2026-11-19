// 시도(trial)별 입력 폴더를 만든다. 입력은 앱의 실제 프롬프트 빌더로 만든다.
// 사용법: bun run prep.ts <reps> <ac10|ac11> <all|id1,id2,...>
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { PERSONAS } from "../../../conversation/personas";
import {
  buildFeedbackPrompt,
  buildPersonaPrompt,
  formatTranscript,
} from "../../../conversation/prompts";

const root = import.meta.dir;
const [repsArg, ac, idsArg] = process.argv.slice(2);
const reps = Number(repsArg);
const wanted = idsArg === "all" ? null : new Set(idsArg.split(","));

const lines = (file: string) =>
  readFileSync(file, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));

if (ac === "ac10") {
  for (const c of lines(`${root}/ac10-cases.jsonl`)) {
    if (wanted && !wanted.has(c.id)) continue;
    for (let k = 1; k <= reps; k++) {
      const dir = `${root}/trials/ac10/${c.id}_rep${k}`;
      mkdirSync(dir, { recursive: true });
      writeFileSync(`${dir}/system.txt`, buildFeedbackPrompt());
      writeFileSync(`${dir}/user.txt`, formatTranscript(c.transcript));
    }
  }
} else {
  for (const c of lines(`${root}/ac11-cases.jsonl`)) {
    if (wanted && !wanted.has(c.id)) continue;
    const persona = PERSONAS.find((p) => p.id === c.persona_id)!;
    for (let k = 1; k <= reps; k++) {
      const dir = `${root}/trials/ac11/${c.id}_rep${k}`;
      mkdirSync(dir, { recursive: true });
      writeFileSync(`${dir}/system.txt`, buildPersonaPrompt(persona, []));
      writeFileSync(
        `${dir}/learner.txt`,
        c.learner_lines.map((l: string, i: number) => `${i + 1}. ${l}`).join("\n"),
      );
    }
  }
}
console.log("prepared", ac, reps, idsArg);
