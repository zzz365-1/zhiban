/**
 * 覆盖率实测报告（纯本地，不联网，不需要密钥）
 * 用法：node scripts/coverage-report.mjs
 *
 * 【为什么要有这个脚本】
 * README 里那句覆盖率之前一直靠人记，记错过两次：
 * 一次把人工判断有日期的条数当成程序抽到的条数，
 * 一次写了个比分母还大的数出来。
 * 数字必须能用一个命令复现，不能靠印象，也不能靠谁说。
 *
 * 【口径】
 * 分母不是全部素材，是「人工逐条判断有值」的那些条。
 * 原文压根没写地点的通知，程序给空是对的，算进分母等于自己吓自己。
 *
 * 【两条路径】
 *   降级路径  本地规则，现场跑
 *   接模型路径 读 scripts/batch-run-031.mjs 已经跑出来的报告，不重复调模型
 *
 * 素材解析出 0 条必须报错，不许把零覆盖渲染成通过（Dec-043）。
 */

import { readFileSync, existsSync } from "node:fs";
import { extractNotice } from "../app/lib/extractNotice.js";
import {
  normalizeChineseDate,
  resolveRelativeDate,
} from "../app/lib/relativeDate.js";
import { isFuzzyDate } from "../app/lib/aiExtract.js";

const SRC = "docs/batch-test-031.md";
const REPORT = "docs/batch-report-031.md";
const NOW = new Date(2026, 10, 2);

if (!existsSync(SRC)) {
  console.error("找不到素材 " + SRC);
  process.exit(1);
}

const raw = readFileSync(SRC, "utf8");
const parts = raw.split(/\*\*第(\d+)条\*\*/).slice(1);
const items = [];
for (let i = 0; i < parts.length; i += 2) {
  const body = parts[i + 1];
  const jIdx = body.indexOf("判断：");
  const notice = (jIdx >= 0 ? body.slice(0, jIdx) : body)
    .replace(/^---/m, "")
    .trim();
  const judge = jIdx >= 0 ? body.slice(jIdx) : "";
  const jd = judge.match(/截止日期：(.+)/);
  const jl = judge.match(/地点：(.+)/);
  items.push({
    num: Number(parts[i]),
    notice,
    judgeDate: jd ? jd[1].trim() : "",
    judgeLoc: jl ? jl[1].trim() : "",
  });
}

if (items.length === 0) {
  console.error("素材解析出 0 条，脚本不会假装通过（Dec-043）");
  process.exit(1);
}

// 接模型路径的逐条结果从已有报告里读，没有报告就只报降级路径。
const model = new Map();
if (existsSync(REPORT)) {
  const rep = readFileSync(REPORT, "utf8");
  const blocks = rep.split(/第(\d+)条 来源:/).slice(1);
  for (let i = 0; i < blocks.length; i += 2) {
    const seg = blocks[i + 1].split("\n")[1] || "";
    const d = seg.match(/日期:([^ ]*)/);
    const l = seg.match(/地点:(.*)$/);
    model.set(Number(blocks[i]), {
      date: d && d[1] !== "空" ? d[1] : "",
      loc: l && l[1].trim() !== "空" ? l[1].trim() : "",
    });
  }
}

const missLocalDate = [];
const missLoc = [];

let judgeDateN = 0;
let judgeLocN = 0;
let localDateHit = 0;
let localLocHit = 0;
let modelDateHit = 0;
let modelLocHit = 0;

for (const it of items) {
  const work = normalizeChineseDate(it.notice);
  const r = extractNotice(work);
  let deadline = r.deadline;
  if (deadline && isFuzzyDate(deadline)) {
    const res = resolveRelativeDate(deadline, NOW);
    if (res) deadline = res.normalized;
  }

  const hasDate = it.judgeDate && it.judgeDate !== "空";
  const hasLoc = it.judgeLoc && it.judgeLoc !== "空";
  if (hasDate) judgeDateN++;
  if (hasLoc) judgeLocN++;
  if (hasDate && deadline) localDateHit++;
  if (hasLoc && r.location) localLocHit++;

  if (hasDate && !deadline) missLocalDate.push(it);
  if (hasLoc && !r.location && !(model.get(it.num) || {}).loc) missLoc.push(it);

  const m = model.get(it.num);
  if (m) {
    if (hasDate && m.date) modelDateHit++;
    if (hasLoc && m.loc) modelLocHit++;
  }
}

function pct(a, b) {
  return b === 0 ? "-" : Math.round((a / b) * 100) + "%";
}

console.log("========== 覆盖率实测 ==========");
console.log("素材 " + items.length + " 条，基准日 2026年11月2日");
console.log(
  "人工判断有截止日期 " + judgeDateN + " 条，有地点 " + judgeLocN + " 条"
);
console.log(
  "接模型路径" +
    (model.size > 0 ? "（读已有报告 " + model.size + " 条）" : "（没有报告，跳过）")
);
console.log("");
console.log("| 口径 | 截止日期 | 地点 |");
console.log("|---|---|---|");
console.log(
  "| 降级路径（本地规则） | " +
    localDateHit + " / " + judgeDateN + "（" + pct(localDateHit, judgeDateN) + "） | " +
    localLocHit + " / " + judgeLocN + "（" + pct(localLocHit, judgeLocN) + "） |"
);
if (model.size > 0) {
  console.log(
    "| 接模型路径 | " +
      modelDateHit + " / " + judgeDateN + "（" + pct(modelDateHit, judgeDateN) + "） | " +
      modelLocHit + " / " + judgeLocN + "（" + pct(modelLocHit, judgeLocN) + "） |"
  );
}
console.log("");

console.log("降级路径日期没抽到的 " + missLocalDate.length + " 条：");
for (const it of missLocalDate) {
  console.log("  第" + it.num + "条 人工判 " + it.judgeDate + " | " + it.notice.replace(/\s+/g, " ").slice(0, 42));
}
console.log("");
console.log("两条路径地点都没抽到的 " + missLoc.length + " 条：");
for (const it of missLoc) {
  console.log("  第" + it.num + "条 人工判 " + it.judgeLoc + " | " + it.notice.replace(/\s+/g, " ").slice(0, 42));
}
