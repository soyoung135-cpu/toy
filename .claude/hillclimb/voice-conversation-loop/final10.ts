// AC10 2단계: 채점자 판정(judge-output-ac10.json)과 1단계 결과를 합쳐 지표를 낸다.
import { existsSync, readFileSync } from "node:fs";

const root = import.meta.dir;
const stage1 = JSON.parse(readFileSync(`${root}/ac10-scored-stage1.json`, "utf8"));
const input = JSON.parse(readFileSync(`${root}/judge-input-ac10.json`, "utf8")).items as { key: string; model_corrections: unknown[] }[];
const verdicts: Record<string, boolean> = existsSync(`${root}/judge-output-ac10.json`)
  ? Object.fromEntries((JSON.parse(readFileSync(`${root}/judge-output-ac10.json`, "utf8")).verdicts as { key: string; fixed: boolean }[]).map((v) => [v.key, v.fixed]))
  : {};

// 채점자 점검
const ctrl = stage1.controlsExpect as Record<string, boolean>;
const ctrlOk = Object.entries(ctrl).map(([k, exp]) => [k, verdicts[k] === exp] as const);
console.log("grader controls:", ctrlOk.map(([k, ok]) => `${k}=${ok ? "OK" : "WRONG"}`).join(" "));

const okTrials = stage1.trials.filter((t: any) => t.status === "ok");
const failTrials = stage1.trials.filter((t: any) => t.status !== "ok");
let planted = 0, caught = 0, fixed = 0;
for (const it of input) {
  if (it.key.startsWith("ctrl-")) continue;
  const trial = it.key.split("#")[0];
  if (failTrials.some((t: any) => t.trial === trial && t.status === "no_output")) continue; // 아직 안 돌린 시도
  planted++;
  if (it.model_corrections.length > 0) caught++;
  if (verdicts[it.key] === true) fixed++;
}
const clean = okTrials.reduce((a: number, t: any) => a + t.clean_total, 0);
const falseC = okTrials.reduce((a: number, t: any) => a + t.false_corrections, 0);
console.log(JSON.stringify({
  trials_ok: okTrials.length, trials_failed_to_parse: failTrials.filter((t: any) => t.status.startsWith("parse_fail")).length,
  planted_errors: planted, matched_by_a_correction: caught, correctly_fixed: fixed,
  recall_fixed: planted ? +(fixed / planted).toFixed(3) : null,
  clean_utterances: clean, falsely_corrected: falseC, false_correction_rate: clean ? +(falseC / clean).toFixed(3) : null,
}, null, 2));
