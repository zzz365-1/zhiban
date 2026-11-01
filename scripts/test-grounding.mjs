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
 *   - 宽容匹配：中文数字↔阿拉伯、空格、括号说明、日期分隔符
 *   - 本地已换算日期直接放行
 *   - 摘要/标题/分类不做核对
 *   - 拦住的值记入 _groundingDropped
 *   - 金丝雀：用真实 groundStringValue 喂编造值，断言必须抓到
 */

import {
  groundStringValue,
  groundDateValue,
  findValueInSource,
} from "../app/lib/grounding.js";
import { mergeAIResult } from "../app/lib/aiExtract.js";

function eq(a, b) {
  return a === b;
}

const SOURCE =
  "关于报送材料的通知。请各学院于11月15日下午5点前将身份证（原件）和申请书交到图书馆六楼研讨室。";

const CASES = [
  // --- 基础核对 ---
  {
    name: "真实地点（精确匹配）通过",
    actual: () => groundStringValue("图书馆六楼研讨室", SOURCE).accepted,
    expected: true,
  },
  {
    name: "真实地点（精确匹配）位置有值",
    actual: () => {
      const g = groundStringValue("图书馆六楼研讨室", SOURCE);
      return g.position !== null && g.position.start >= 0;
    },
    expected: true,
  },
  {
    name: "编造地点（教务处一楼大厅）被拦",
    actual: () => groundStringValue("教务处一楼大厅", SOURCE).accepted,
    expected: false,
  },
  {
    name: "编造地点被拦的 reason 含“找不到”",
    actual: () => {
      const g = groundStringValue("教务处一楼大厅", SOURCE);
      return !g.accepted && g.reason.includes("找不到");
    },
    expected: true,
  },
  {
    name: "真实材料（身份证）通过",
    actual: () => groundStringValue("身份证", SOURCE).accepted,
    expected: true,
  },
  {
    name: "编造材料（成绩单）被拦",
    actual: () => groundStringValue("成绩单", SOURCE).accepted,
    expected: false,
  },
  {
    name: "真实时间（17:00）被拦（原文写“下午5点”，字面不同）",
    actual: () => groundStringValue("17:00", SOURCE).accepted,
    expected: false,
  },
  {
    name: "编造时间（晚上8点）被拦",
    actual: () => groundStringValue("晚上8点", SOURCE).accepted,
    expected: false,
  },

  // --- 宽容匹配 ---
  {
    name: "汉字数字 vs 阿拉伯：图书馆6楼研讨室 vs 图书馆六楼研讨室 通过",
    actual: () => groundStringValue("图书馆6楼研讨室", SOURCE).accepted,
    expected: true,
  },
  {
    name: "空白差异：图书馆 六楼 研讨室 通过",
    actual: () => groundStringValue("图书馆 六楼 研讨室", SOURCE).accepted,
    expected: true,
  },
  {
    name: "括号说明：身份证（原件）完整 通过",
    actual: () => groundStringValue("身份证（原件）", SOURCE).accepted,
    expected: true,
  },
  {
    name: "括号说明：身份证（原件）带半角括号 通过",
    actual: () => groundStringValue("身份证(原件)", SOURCE).accepted,
    expected: true,
  },

  // --- 日期核对 ---
  {
    name: "日期：完整年月日 vs 原文月日 通过（月日相同）",
    actual: () => groundDateValue("2026年11月15日", SOURCE).accepted,
    expected: true,
  },
  {
    name: "日期：横杠格式 vs 原文月日 通过",
    actual: () => groundDateValue("2026-11-15", SOURCE).accepted,
    expected: true,
  },
  {
    name: "日期：斜杠格式 vs 原文月日 通过",
    actual: () => groundDateValue("2026/11/15", SOURCE).accepted,
    expected: true,
  },
  {
    name: "日期：月日不同（11月16日）被拦",
    actual: () => groundDateValue("2026年11月16日", SOURCE).accepted,
    expected: false,
  },
  {
    name: "日期：完全不相关的日期（12月1日）被拦",
    actual: () => groundDateValue("2026年12月1日", SOURCE).accepted,
    expected: false,
  },

  // --- mergeAIResult 端到端 ---
  {
    name: "merge：编造的地点被拦，location 变 null",
    actual: () => {
      const r = mergeAIResult(
        {},
        { location: "教务处一楼大厅" },
        SOURCE
      );
      return r.location;
    },
    expected: null,
  },
  {
    name: "merge：编造的地点记入 _groundingDropped",
    actual: () => {
      const r = mergeAIResult(
        {},
        { location: "教务处一楼大厅" },
        SOURCE
      );
      return r._groundingDropped.some(
        (d) => d.field === "location" && d.value === "教务处一楼大厅"
      );
    },
    expected: true,
  },
  {
    name: "merge：真实地点通过，position 有值",
    actual: () => {
      const r = mergeAIResult(
        {},
        { location: "图书馆六楼研讨室" },
        SOURCE
      );
      return (
        r.location === "图书馆六楼研讨室" &&
        r._groundingPositions.location !== undefined
      );
    },
    expected: true,
  },
  {
    name: "merge：编造的材料被拦（成绩单）",
    actual: () => {
      const r = mergeAIResult({}, { materials: ["成绩单"] }, SOURCE);
      return r.materials.length;
    },
    expected: 0,
  },
  {
    name: "merge：真实材料保留（身份证）",
    actual: () => {
      const r = mergeAIResult({}, { materials: ["身份证"] }, SOURCE);
      return r.materials.includes("身份证");
    },
    expected: true,
  },
  {
    name: "merge：编造的日期被拦，deadline 和 time 一起清空",
    actual: () => {
      const r = mergeAIResult(
        {},
        { deadline: "2026年12月1日", time: "17:00" },
        SOURCE
      );
      return r.deadline === null && r.time === null;
    },
    expected: true,
  },
  {
    name: "merge：本地已换算日期（_locallyResolved）直接放行",
    actual: () => {
      const r = mergeAIResult(
        { deadline: "2026年11月4日", _locallyResolved: true },
        {},
        SOURCE
      );
      return r.deadline;
    },
    expected: "2026年11月4日",
  },
  {
    name: "merge：摘要不做核对（原样保留）",
    actual: () => {
      const r = mergeAIResult(
        {},
        { summary: "模型自己编的摘要" },
        SOURCE
      );
      return r.summary;
    },
    expected: "模型自己编的摘要",
  },
  {
    name: "merge：标题不做核对（原样保留）",
    actual: () => {
      const r = mergeAIResult(
        {},
        { title: "模型组织的标题" },
        SOURCE
      );
      return r.title;
    },
    expected: "模型组织的标题",
  },
  {
    name: "merge：分类非法值走白名单（球赛 → null）",
    actual: () => {
      const r = mergeAIResult({}, { category: "球赛" }, SOURCE);
      return r.category;
    },
    expected: null,
  },
  {
    name: "merge：分类合法值保留（教务）",
    actual: () => {
      const r = mergeAIResult({}, { category: "教务" }, SOURCE);
      return r.category;
    },
    expected: "教务",
  },
];

// ---------- 金丝雀 ----------

/**
 * 【为什么要用真实 groundStringValue】
 * 上一版的金丝雀自己造了个假函数，跟生产代码没关系，改坏了也不报警。
 * 这一版直接用真实 groundStringValue 跑一段确定编造的值，
 * 同时写一个错误期望（期望它被接受）。
 * 如果真实实现正确拦截（accepted: false），断言拒绝，金丝雀 PASS。
 * 如果真实实现被改坏成永远接受（accepted: true），断言错误通过，金丝雀 BROKEN。
 */
function runCanaryString() {
  const source = "请将材料交到图书馆六楼研讨室";
  const fake = "教务处一楼大厅";
  const result = groundStringValue(fake, source);

  console.log("[金丝雀 A] groundStringValue 对编造地点，断言必须拒绝");
  console.log("    真实返回 accepted：" + result.accepted);
  console.log("    错误期望 accepted：true");

  const wouldPass = eq(result.accepted, true);
  if (wouldPass) {
    console.log("    BROKEN - 真实实现接受了编造值，或断言逻辑已坏");
    return false;
  }
  console.log("    真实实现正确拦截");
  return true;
}

/**
 * 【金丝雀 B：用真实 mergeAIResult 端到端】
 * 编造的地点进 mergeAIResult，应该被拦，location 变 null。
 * 写一个错误期望（期望 location 是编造的原值）。
 * 如果真实实现返回 null，断言拒绝，金丝雀 PASS。
 * 如果真实实现原样返回编造值（说明核对失效），金丝雀 BROKEN。
 */
function runCanaryMerge() {
  const source = "请将材料交到图书馆六楼研讨室";
  const fake = "教务处一楼大厅";
  const r = mergeAIResult({}, { location: fake }, source);

  console.log("[金丝雀 B] mergeAIResult 对编造地点，断言必须拒绝");
  console.log("    真实 location：" + JSON.stringify(r.location));
  console.log("    错误期望 location：" + JSON.stringify(fake));

  const wouldPass = eq(r.location, fake);
  if (wouldPass) {
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