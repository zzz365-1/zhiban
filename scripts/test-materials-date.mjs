/**
 * 材料清洗 自检
 * 用法：node scripts/test-materials-date.mjs
 *
 * 引用页面真实模块：../app/lib/extractNotice.js
 *
 * 覆盖：
 *   - 括号说明被去掉（全角/半角），括号里的“原件”不被当作材料
 *   - 末尾标点被去掉
 *   - “身份证和身份证复印件”不被拆乱：期望“身份证,身份证复印件”
 *   - 三样材料全部识别
 *   - 金丝雀：用不去括号的坏实现，断言必须拒绝
 */

import { extractNotice } from "../app/lib/extractNotice.js";

function eq(a, b) {
  return a === b;
}

const CASES = [
  // --- 括号说明 ---
  {
    name: "括号说明被去掉（含逗号）：身份证和选民证",
    actual: () =>
      extractNotice(
        "请携带身份证和选民证（今天会发到大家手里，大家填好保存好）。"
      ).materials.join(","),
    expected: "身份证,选民证",
  },
  {
    name: "括号说明里含逗号也不产生碎片",
    actual: () => {
      const m = extractNotice(
        "请携带身份证和选民证（今天会发到大家手里，大家填好保存好）。"
      ).materials;
      return m.some((x) => x.includes("（") || x.includes("，"));
    },
    expected: false,
  },
  {
    name: "全角括号原件：身份证和学生证，不含“原件”",
    actual: () =>
      extractNotice("携带身份证（原件）和学生证。").materials.join(","),
    expected: "身份证,学生证",
  },
  {
    name: "全角括号原件的材料里没有“原件”",
    actual: () =>
      extractNotice("携带身份证（原件）和学生证。").materials.includes(
        "原件"
      ),
    expected: false,
  },
  {
    name: "半角括号原件：身份证和学生证，不含“原件”",
    actual: () =>
      extractNotice("携带身份证(原件)和学生证。").materials.join(","),
    expected: "身份证,学生证",
  },
  {
    name: "半角括号原件的材料里没有“原件”",
    actual: () =>
      extractNotice("携带身份证(原件)和学生证。").materials.includes(
        "原件"
      ),
    expected: false,
  },

  // --- 末尾标点 ---
  {
    name: "末尾句号被去掉：一支黑色笔。→ 黑色笔",
    actual: () => extractNotice("请携带一支黑色笔。").materials.join(","),
    expected: "黑色笔",
  },
  {
    name: "末尾逗号被去掉",
    actual: () => extractNotice("请携带身份证，").materials.join(","),
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

  // --- 相近材料不被拆乱 ---
  {
    name: "身份证和身份证复印件：期望 身份证,身份证复印件",
    actual: () =>
      extractNotice("请携带身份证和身份证复印件。").materials.join(","),
    expected: "身份证,身份证复印件",
  },
  {
    name: "身份证和身份证复印件：不出现孤立的“复印件”",
    actual: () =>
      extractNotice("请携带身份证和身份证复印件。").materials.includes(
        "复印件"
      ),
    expected: false,
  },
  {
    name: "身份证和身份证复印件：身份证只出现一次",
    actual: () => {
      const m = extractNotice("请携带身份证和身份证复印件。").materials;
      return m.filter((x) => x === "身份证").length;
    },
    expected: 1,
  },
  {
    name: "只有身份证复印件时：结果就是身份证复印件",
    actual: () =>
      extractNotice("请携带身份证复印件。").materials.join(","),
    expected: "身份证复印件",
  },

  // --- 三样材料全部识别 ---
  {
    name: "三样材料：身份证、学生证、照片",
    actual: () => {
      const m = extractNotice("请携带身份证、学生证、照片。").materials;
      return (
        m.length === 3 &&
        m.includes("身份证") &&
        m.includes("学生证") &&
        m.includes("照片")
      );
    },
    expected: true,
  },
  {
    name: "带括号的三样：身份证、选民证、黑色笔",
    actual: () => {
      const m = extractNotice(
        "请携带身份证、选民证（今天发到大家手里），还要带一支黑色笔。"
      ).materials;
      return (
        m.includes("身份证") &&
        m.includes("选民证") &&
        m.includes("黑色笔") &&
        !m.includes("原件")
      );
    },
    expected: true,
  },
];

// ---------- 金丝雀 ----------

/**
 * 坏实现：不去括号。
 * 对“携带身份证（原件）和学生证”会命中“原件”。
 */
function brokenExtractMaterials(text) {
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
  const text = "携带身份证（原件）和学生证。";
  const expected = "身份证,学生证";
  const brokenResult = brokenExtractMaterials(text).join(",");
  const realResult = extractNotice(text).materials.join(",");

  console.log("[金丝雀] 用不去括号的坏实现，断言必须拒绝");
  console.log("    真实实现：" + JSON.stringify(realResult));
  console.log("    坏实现：" + JSON.stringify(brokenResult));
  console.log("    期望：" + JSON.stringify(expected));

  const wouldPass = eq(brokenResult, expected);
  if (wouldPass) {
    console.log("    BROKEN - 坏实现被错误判为返回了干净清单");
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