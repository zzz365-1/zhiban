/**
 * 出处核对 自检
 * 用法：node scripts/test-grounding.mjs
 *
 * 引用真实模块：
 *   ../app/lib/grounding.js
 *   ../app/lib/aiExtract.js
 *
 * 覆盖：
 *   - 编造的地点、材料、时间必须拦住
 *   - 真实值（精确/宽松）必须放行
 *   - 宽容匹配：中文数字↔阿拉伯、空格、括号说明、日期三种写法、时间两种写法
 *   - 本地已换算日期直接放行
 *   - 摘要/标题/分类不做核对
 *   - 金丝雀：用真实 groundStringValue 喂编造值
 */

import {
  groundStringValue,
  groundDateValue,
  groundTimeValue,
} from "../app/lib/grounding.js";
import { mergeAIResult } from "../app/lib/aiExtract.js";

function eq(a, b) {
  return a === b;
}

const SOURCE =
  "关于报送材料的通知。请各学院于十一月十五日下午5点前将身份证（原件）和申请书交到图书馆六楼研讨室。";

const CASES = [
  // --- 基础核对 ---
  { name: "真实地点（精确匹配）通过", actual: () => groundStringValue("图书馆六楼研讨室", SOURCE).accepted, expected: true },
  { name: "真实地点位置有值", actual: () => {
      const g = groundStringValue("图书馆六楼研讨室", SOURCE);
      return g.position !== null && g.position.start >= 0;
    }, expected: true },
  { name: "编造地点（教务处一楼大厅）被拦", actual: () => groundStringValue("教务处一楼大厅", SOURCE).accepted, expected: false },
  { name: "编造地点 reason 含“找不到”", actual: () => {
      const g = groundStringValue("教务处一楼大厅", SOURCE);
      return !g.accepted && g.reason.includes("找不到");
    }, expected: true },
  { name: "真实材料（身份证）通过", actual: () => groundStringValue("身份证", SOURCE).accepted, expected: true },
  { name: "编造材料（成绩单）被拦", actual: () => groundStringValue("成绩单", SOURCE).accepted, expected: false },
  { name: "编造时间（晚上8点）被拦", actual: () => groundTimeValue("晚上8点", SOURCE).accepted, expected: false },

  // --- 地点宽容 ---
  { name: "汉字数字 vs 阿拉伯：图书馆6楼研讨室 通过", actual: () => groundStringValue("图书馆6楼研讨室", SOURCE).accepted, expected: true },
  { name: "空白差异：图书馆 六楼 研讨室 通过", actual: () => groundStringValue("图书馆 六楼 研讨室", SOURCE).accepted, expected: true },
  { name: "括号说明：身份证（原件） 通过", actual: () => groundStringValue("身份证（原件）", SOURCE).accepted, expected: true },
  { name: "括号说明：身份证(原件) 半角 通过", actual: () => groundStringValue("身份证(原件)", SOURCE).accepted, expected: true },

  // --- 日期宽容 ---
  // 原文“十一月十五日”，月日 = 11-15
  { name: "日期：中文年月日 2026年11月15日 通过", actual: () => groundDateValue("2026年11月15日", SOURCE).accepted, expected: true },
  { name: "日期：横杠格式 2026-11-15 通过", actual: () => groundDateValue("2026-11-15", SOURCE).accepted, expected: true },
  { name: "日期：斜杠格式 2026/11/15 通过", actual: () => groundDateValue("2026/11/15", SOURCE).accepted, expected: true },
  { name: "日期：点分隔 2026.11.15 通过", actual: () => groundDateValue("2026.11.15", SOURCE).accepted, expected: true },
  { name: "日期：仅月日 11月15日 通过", actual: () => groundDateValue("11月15日", SOURCE).accepted, expected: true },
  { name: "日期：月日不同（11月16日）被拦", actual: () => groundDateValue("2026年11月16日", SOURCE).accepted, expected: false },
  { name: "日期：完全不相关的日期（12月1日）被拦", actual: () => groundDateValue("2026年12月1日", SOURCE).accepted, expected: false },

  // --- 时间宽容 ---
  // 原文“下午5点” = 17:00
  { name: "时间：17:00（24小时制）通过", actual: () => groundTimeValue("17:00", SOURCE).accepted, expected: true },
  { name: "时间：17点 通过", actual: () => groundTimeValue("17点", SOURCE).accepted, expected: true },
  { name: "时间：17点整 通过", actual: () => groundTimeValue("17点整", SOURCE).accepted, expected: true },
  { name: "时间：下午5点 通过", actual: () => groundTimeValue("下午5点", SOURCE).accepted, expected: true },
  { name: "时间：下午五点 通过", actual: () => groundTimeValue("下午五点", SOURCE).accepted, expected: true },
  { name: "时间：晚上9点（原文是下午5点）被拦", actual: () => groundTimeValue("晚上9点", SOURCE).accepted, expected: false },

  // --- mergeAIResult 端到端 ---
  { name: "merge：编造地点被拦，location 变 null", actual: () => mergeAIResult({}, { location: "教务处一楼大厅" }, SOURCE).location, expected: null },
  { name: "merge：编造地点记入 _groundingDropped", actual: () => {
      const r = mergeAIResult({}, { location: "教务处一楼大厅" }, SOURCE);
      return r._groundingDropped.some((d) => d.field === "location" && d.value === "教务处一楼大厅");
    }, expected: true },
  { name: "merge：真实地点通过，position 有值", actual: () => {
      const r = mergeAIResult({}, { location: "图书馆六楼研讨室" }, SOURCE);
      return r.location === "图书馆六楼研讨室" && r._groundingPositions.location !== undefined;
    }, expected: true },
  { name: "merge：编造材料被拦", actual: () => mergeAIResult({}, { materials: ["成绩单"] }, SOURCE).materials.length, expected: 0 },
  { name: "merge：真实材料保留", actual: () => mergeAIResult({}, { materials: ["身份证"] }, SOURCE).materials.includes("身份证"), expected: true },
  { name: "merge：编造日期被拦，deadline 和 time 一起清空", actual: () => {
      const r = mergeAIResult({}, { deadline: "2026年12月1日", time: "17:00" }, SOURCE);
      return r.deadline === null && r.time === null;
    }, expected: true },
  { name: "merge：横杠日期通过，deadline 保留", actual: () => {
      const r = mergeAIResult({}, { deadline: "2026-11-15" }, SOURCE);
      return r.deadline;
    }, expected: "2026-11-15" },
  { name: "merge：17:00 与原文下午5点视为同一时刻，time 保留", actual: () => {
      const r = mergeAIResult({}, { deadline: "2026-11-15", time: "17:00" }, SOURCE);
      return r.time;
    }, expected: "17:00" },
  { name: "merge：本地已换算日期直接放行", actual: () => {
      const r = mergeAIResult({ deadline: "2026年11月4日", _locallyResolved: true }, {}, SOURCE);
      return r.deadline;
    }, expected: "2026年11月4日" },
  { name: "merge：摘要不做核对", actual: () => mergeAIResult({}, { summary: "模型自己编的摘要" }, SOURCE).summary, expected: "模型自己编的摘要" },
  { name: "merge：标题不做核对", actual: () => mergeAIResult({}, { title: "模型组织的标题" }, SOURCE).title, expected: "模型组织的标题" },
  { name: "merge：分类非法值走白名单（球赛 → null）", actual: () => mergeAIResult({}, { category: "球赛" }, SOURCE).category, expected: null },
  { name: "merge：分类合法值保留（教务）", actual: () => mergeAIResult({}, { category: "教务" }, SOURCE).category, expected: "教务" },
];

// ---------- 金丝雀 ----------

function runCanaryString() {
  const source = "请将材料交到图书馆六楼研讨室";
  const fake = "教务处一楼大厅";
  const result = groundStringValue(fake, source);

  console.log("[金丝雀 A] groundStringValue 对编造地点，断言必须拒绝");
  console.log("    真实返回 accepted：" + result.accepted);
  console.log("    错误期望 accepted：true");

  if (eq(result.accepted, true)) {
    console.log("    BROKEN - 真实实现接受了编造值，或断言逻辑已坏");
    return false;
  }
  console.log("    真实实现正确拦截");
  return true;
}

function runCanaryMerge() {
  const source = "请将材料交到图书馆六楼研讨室";
  const fake = "教务处一楼大厅";
  const r = mergeAIResult({}, { location: fake }, source);

  console.log("[金丝雀 B] mergeAIResult 对编造地点，断言必须拒绝");
  console.log("    真实 location：" + JSON.stringify(r.location));
  console.log("    错误期望 location：" + JSON.stringify(fake));

  if (eq(r.location, fake)) {
    console.log("    BROKEN - 真实 merge 原样返回了编造值，或断言逻辑已坏");
    return false;
  }
  console.log("    真实 merge 正确拦下编造值");
  return true;
}

// ---------- 主流程 ----------

let pass = 0;
let fail = 0;

for (let i = 0; i < CASES.length; i++) {
  const c = CASES[i];
  const actual = c.actual();
  const ok = eq(actual, c.expected);

  if (ok) pass++;
  else fail++;

  console.log(
    "[" + (i + 1) + "/" + CASES.length + "] " +
      (ok ? "PASS" : "FAIL") + " - " + c.name
  );
  console.log("    期望：" + JSON.stringify(c.expected));
  console.log("    实际：" + JSON.stringify(actual));
  console.log("");
}

console.log("========== 金丝雀 ==========");
console.log("");
const c1 = runCanaryString();
console.log("");
const c2 = runCanaryMerge();
console.log("");

const canaryOk = c1 && c2;

console.log(
  "业务结果：" + pass + " 通过 / " + fail + " 失败 / 共 " + CASES.length + " 条"
);
console.log(
  "金丝雀结果：" +
    (canaryOk ? "按预期 FAIL（两个金丝雀都正常）" : "异常 PASS（至少一个金丝雀失灵）")
);

if (fail > 0 || !canaryOk) {
  process.exitCode = 1;
}