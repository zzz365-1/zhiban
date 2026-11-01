/**
 * 材料清洗 自检
 * 用法：node scripts/test-materials-date.mjs
 *
 * 引用页面真实模块：../app/lib/extractNotice.js
 *
 * 覆盖：
 *   - 提示语“材料”不出现在清单里
 *   - “一寸照片”不被切成“寸照片”
 *   - 顿号列举的“身份证复印件”不被拆成“身份证”和“复印件”
 *   - “黑色笔到现场”的尾部地点短语被去掉
 *   - 括号说明被去掉、末尾标点被去掉、相近材料不拆乱
 *   - 金丝雀：用不去地点尾巴的坏实现，断言必须拒绝
 */

import { extractNotice } from "../app/lib/extractNotice.js";

function eq(a, b) {
  return a === b;
}

const CASES = [
  // --- 提示语“材料” ---
  {
    name: "需提交材料：身份证、学生证、一寸照片 —— 不含“材料”",
    actual: () =>
      extractNotice(
        "需提交材料：身份证、学生证、一寸照片。"
      ).materials.includes("材料"),
    expected: false,
  },
  {
    name: "需提交材料：身份证、学生证、一寸照片 —— 三样齐全",
    actual: () => {
      const m = extractNotice(
        "需提交材料：身份证、学生证、一寸照片。"
      ).materials;
      return (
        m.includes("身份证") &&
        m.includes("学生证") &&
        m.includes("一寸照片")
      );
    },
    expected: true,
  },
  {
    name: "附件包括：身份证 —— 不含“附件”",
    actual: () =>
      extractNotice("附件包括：身份证。").materials.includes("附件"),
    expected: false,
  },

  // --- 一寸照片 ---
  {
    name: "一寸照片不被切成“寸照片”",
    actual: () =>
      extractNotice("请携带一寸照片。").materials.includes("寸照片"),
    expected: false,
  },
  {
    name: "一寸照片完整保留",
    actual: () =>
      extractNotice("请携带一寸照片。").materials.includes("一寸照片"),
    expected: true,
  },
  {
    name: "二寸照片完整保留",
    actual: () =>
      extractNotice("请携带二寸照片。").materials.includes("二寸照片"),
    expected: true,
  },
  {
    name: "一支黑色笔去掉量词，保留“黑色笔”",
    actual: () =>
      extractNotice("请携带一支黑色笔。").materials.join(","),
    expected: "黑色笔",
  },

  // --- 顿号列举的复合词 ---
  {
    name: "顿号列举：一寸免冠照片、身份证复印件 —— 含身份证复印件",
    actual: () =>
      extractNotice(
        "报到时需交：一寸免冠照片、身份证复印件。"
      ).materials.includes("身份证复印件"),
    expected: true,
  },
  {
    name: "顿号列举：不含孤立的“身份证”",
    actual: () =>
      extractNotice(
        "报到时需交：一寸免冠照片、身份证复印件。"
      ).materials.includes("身份证"),
    expected: false,
  },
  {
    name: "顿号列举：不含孤立的“复印件”",
    actual: () =>
      extractNotice(
        "报到时需交：一寸免冠照片、身份证复印件。"
      ).materials.includes("复印件"),
    expected: false,
  },
  {
    name: "和连接：身份证和身份证复印件 —— 身份证、身份证复印件",
    actual: () =>
      extractNotice("请携带身份证和身份证复印件。").materials.join(","),
    expected: "身份证,身份证复印件",
  },
  {
    name: "和连接：身份证只出现一次",
    actual: () => {
      const m = extractNotice("请携带身份证和身份证复印件。").materials;
      return m.filter((x) => x === "身份证").length;
    },
    expected: 1,
  },

  // --- 尾部地点短语 ---
  {
    name: "黑色笔到现场 —— 不含“到现场”",
    actual: () =>
      extractNotice(
        "请携带身份证和选民证，还要带一支黑色笔到现场。"
      ).materials.includes("黑色笔到现场"),
    expected: false,
  },
  {
    name: "黑色笔到现场 —— 含“黑色笔”",
    actual: () =>
      extractNotice(
        "请携带身份证和选民证，还要带一支黑色笔到现场。"
      ).materials.includes("黑色笔"),
    expected: true,
  },
  {
    name: "黑色笔到现场 —— 三样材料齐全",
    actual: () => {
      const m = extractNotice(
        "请携带身份证和选民证，还要带一支黑色笔到现场。"
      ).materials;
      return (
        m.includes("身份证") &&
        m.includes("选民证") &&
        m.includes("黑色笔")
      );
    },
    expected: true,
  },

  // --- 回归：括号、标点 ---
  {
    name: "全角括号原件：身份证和学生证，不含“原件”",
    actual: () =>
      extractNotice("携带身份证（原件）和学生证。").materials.join(","),
    expected: "身份证,学生证",
  },
  {
    name: "半角括号原件：身份证和学生证，不含“原件”",
    actual: () =>
      extractNotice("携带身份证(原件)和学生证。").materials.join(","),
    expected: "身份证,学生证",
  },
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
];

// ---------- 金丝雀 ----------

/**
 * 坏实现：去掉量词但不截断尾部地点短语。
 * 对“一支黑色笔到现场”会返回“黑色笔到现场”。
 * 如果断言把这个当成正确结果，说明断言坏了。
 */
function brokenCleanMaterial(s) {
  let t = String(s || "").trim();
  t = t.replace(new RegExp("^[0-9一二三四五六七八九十]+[支张份个本件套盒把台部只条枚页瓶包块片]?"), "");
  return t;
}

function runCanary() {
  const text = "一支黑色笔到现场";
  const expected = "黑色笔";
  const brokenResult = brokenCleanMaterial(text);
  const realResult = extractNotice("请携带一支黑色笔到现场。").materials.join(",");

  console.log("[金丝雀] 用不截断尾部地点的坏实现，断言必须拒绝");
  console.log("    真实实现：" + JSON.stringify(realResult));
  console.log("    坏实现：" + JSON.stringify(brokenResult));
  console.log("    期望包含：" + JSON.stringify(expected));

  const wouldPass = brokenResult === expected;
  if (wouldPass) {
    console.log("    BROKEN - 坏实现被错误判为返回了干净材料名");
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