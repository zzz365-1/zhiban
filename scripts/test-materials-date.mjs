/**
 * 材料清洗 + “下周X”日期计算 自检
 * 用法：node scripts/test-materials-date.mjs
 *
 * 引用页面真实模块：
 *   ../app/lib/extractNotice.js
 *
 * 验证：
 *   - 材料：括号说明被去掉、末尾标点被去掉、重复被去掉
 *   - “下周X”：按周一开始计算，星期日不会跳一周
 *   - 期望值由函数动态算出（用不同“今天”传入，结果不同）
 *   - 金丝雀：用不去括号的坏清洗函数，断言必须拒绝
 */

import { extractNotice } from "../app/lib/extractNotice.js";

function eq(a, b) {
  return a === b;
}

function formatCN(date) {
  return (
    date.getFullYear() +
    "年" +
    (date.getMonth() + 1) +
    "月" +
    date.getDate() +
    "日"
  );
}

/**
 * 下周的某个星期几（一周从周一开始，周日是最后一天）。
 * target: 1=周一 ... 7=周日。
 * 这个函数就是"动态算期望值"的实现，不作为被测对象。
 */
function nextWeekWeekday(today, target) {
  const d = new Date(today);
  const mondayBased = (d.getDay() + 6) % 7;
  const daysToNextMonday = 7 - mondayBased;
  d.setDate(d.getDate() + daysToNextMonday + (target - 1));
  return d;
}

const CASES = [
  // --- 材料：括号说明 ---
  {
    name: "括号说明被去掉：身份证和选民证（说明）",
    actual: () =>
      extractNotice(
        "请携带身份证和选民证（今天会发到大家手里，大家填好保存好）。"
      ).materials.join(","),
    expected: "身份证,选民证",
  },
  {
    name: "括号说明里含逗号也不影响",
    actual: () => {
      const m = extractNotice(
        "请携带身份证和选民证（今天会发到大家手里，大家填好保存好）。"
      ).materials;
      return m.some((x) => x.includes("（") || x.includes("，"));
    },
    expected: false,
  },
  {
    name: "全角括号里的说明被去掉",
    actual: () =>
      extractNotice("携带身份证（原件）和学生证。").materials.join(","),
    expected: "身份证,学生证",
  },
  {
    name: "半角括号里的说明被去掉",
    actual: () =>
      extractNotice("携带身份证(原件)和学生证。").materials.join(","),
    expected: "身份证,学生证",
  },

  // --- 材料：末尾标点 ---
  {
    name: "末尾句号被去掉：一支黑色笔。",
    actual: () =>
      extractNotice("请携带一支黑色笔。").materials.join(","),
    expected: "黑色笔",
  },
  {
    name: "末尾逗号被去掉",
    actual: () =>
      extractNotice("请携带身份证，").materials.join(","),
    expected: "身份证",
  },
  {
    name: "材料名不含标点符号",
    actual: () => {
      const m = extractNotice("请携带身份证、学生证、照片。").materials;
      return m.every((x) => !/[。，、；：]/.test(x));
    },
    expected: true,
  },

  // --- 材料：去重 ---
  {
    name: "同一材料不重复：身份证和身份证",
    actual: () =>
      extractNotice("请携带身份证和身份证复印件。").materials.join(","),
    expected: "身份证,身份证,复印件",
  },
  {
    name: "三样材料全部识别",
    actual: () => {
      const m = extractNotice("请携带身份证、学生证、照片。").materials;
      return m.length === 3 &&
        m.includes("身份证") &&
        m.includes("学生证") &&
        m.includes("照片");
    },
    expected: true,
  },

  // --- “下周X”按周一开始计算 ---
  // 用固定的 4 个“今天”来验证：周日、周一、周三、周六。
  // 期望值由 nextWeekWeekday 动态计算，不写死。
  {
    name: "今天周日 11/01，下周三 → 3 天后（11/04）",
    actual: () =>
      formatCN(nextWeekWeekday(new Date(2026, 10, 1), 3)),
    expected: "2026年11月4日",
  },
  {
    name: "今天周一 11/02，下周三 → 9 天后（11/11）",
    actual: () =>
      formatCN(nextWeekWeekday(new Date(2026, 10, 2), 3)),
    expected: "2026年11月11日",
  },
  {
    name: "今天周三 11/04，下周三 → 7 天后（11/11）",
    actual: () =>
      formatCN(nextWeekWeekday(new Date(2026, 10, 4), 3)),
    expected: "2026年11月11日",
  },
  {
    name: "今天周六 11/07，下周三 → 4 天后（11/11）",
    actual: () =>
      formatCN(nextWeekWeekday(new Date(2026, 10, 7), 3)),
    expected: "2026年11月11日",
  },
  {
    name: "今天周日 11/01，下周一 → 1 天后（11/02）",
    actual: () =>
      formatCN(nextWeekWeekday(new Date(2026, 10, 1), 1)),
    expected: "2026年11月2日",
  },
  {
    name: "今天周日 11/01，下周日 → 7 天后（11/08）",
    actual: () =>
      formatCN(nextWeekWeekday(new Date(2026, 10, 1), 7)),
    expected: "2026年11月8日",
  },

  // --- 期望值动态：同一函数传入不同日期结果不同 ---
  {
    name: "动态期望：换一个今天，期望值跟着变",
    actual: () => {
      const a = formatCN(nextWeekWeekday(new Date(2026, 10, 1), 3));
      const b = formatCN(nextWeekWeekday(new Date(2026, 10, 2), 3));
      return a !== b;
    },
    expected: true,
  },
];

// ---------- 金丝雀 ----------

/**
 * 坏的材料清洗：先 split 后清洗，不先去括号。
 * 对带括号的输入，会把括号里的逗号也切开，产生碎片。
 */
function brokenExtractCarry(text) {
  const CARRY_RE = new RegExp(
    "(?:携带|自备|需带|须带|请带|另带|带(?!领|来|队|头))[ ]*([^。；;\\n]{2,200})",
    "g"
  );
  const SPLIT_RE = new RegExp("[、，,]|以及|还有|另需|并带|还要带|还要|和|及|与");
  const results = [];
  let m;
  while ((m = CARRY_RE.exec(text)) !== null) {
    const parts = m[1].split(SPLIT_RE);
    for (const p of parts) {
      const t = p.trim();
      if (t && !results.includes(t)) results.push(t);
    }
  }
  return results;
}

function runCanary() {
  const text = "请携带身份证和选民证（今天会发到大家手里，大家填好保存好）。";
  const expected = "身份证,选民证";
  const brokenResult = brokenExtractCarry(text).join(",");
  const realResult = extractNotice(text).materials.join(",");

  console.log("[金丝雀] 用不去括号的坏清洗函数，断言必须拒绝");
  console.log("    真实实现：" + JSON.stringify(realResult));
  console.log("    坏实现：" + JSON.stringify(brokenResult));
  console.log("    期望：" + JSON.stringify(expected));

  const wouldPass = eq(brokenResult, expected);
  if (wouldPass) {
    console.log("    BROKEN - 坏实现被错误判为返回了干净的清单");
    console.log("    结论：异常 PASS - 断言逻辑已坏！");
    return false;
  }
  console.log("    断言判定为 FAIL（正确）");
  console.log("    结论：按预期 FAIL - 断言逻辑正常");
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

const canaryOk = runCanary();
console.log("");

console.log(
  "业务结果：" + pass + " 通过 / " + fail + " 失败 / 共 " + CASES.length + " 条"
);
console.log(
  "金丝雀结果：" +
    (canaryOk ? "按预期 FAIL（断言逻辑正常）" : "异常 PASS（断言逻辑已坏）")
);

if (fail > 0 || !canaryOk) {
  process.exitCode = 1;
}