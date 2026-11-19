// AC11 2단계: 채점자 판정(judge-output-ac11.json)을 합산한다.
import { existsSync, readFileSync } from "node:fs";

const root = import.meta.dir;
const stage1 = JSON.parse(readFileSync(`${root}/ac11-scored-stage1.json`, "utf8"));
const items = JSON.parse(readFileSync(`${root}/judge-input-ac11.json`, "utf8")).items as { key: string; partner_reply: string }[];
const verdicts: Record<string, boolean> = existsSync(`${root}/judge-output-ac11.json`)
  ? Object.fromEntries((JSON.parse(readFileSync(`${root}/judge-output-ac11.json`, "utf8")).verdicts as { key: string; breaks_role: boolean }[]).map((v) => [v.key, v.breaks_role]))
  : {};
const ctrl = stage1.controlsExpect as Record<string, boolean>;
console.log("grader controls:", Object.entries(ctrl).map(([k, exp]) => `${k}=${verdicts[k] === exp ? "OK" : "WRONG"}`).join(" "));
const real = items.filter((i) => !i.key.startsWith("ctrl-"));
const breaks = real.filter((i) => verdicts[i.key] === true);
console.log(JSON.stringify({
  trials_ok: stage1.trials.filter((t: any) => t.status === "ok").length,
  trials_bad: stage1.trials.filter((t: any) => t.status !== "ok" && t.status !== "no_output").length,
  responses: real.length, role_breaks: breaks.length,
  role_break_rate: real.length ? +(breaks.length / real.length).toFixed(3) : null,
  break_examples: breaks.slice(0, 5).map((b) => b.partner_reply),
}, null, 2));
