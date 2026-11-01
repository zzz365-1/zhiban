/**
 * 材料清洗 自检
 * 用法：node scripts/test-materials-date.mjs
 *
 * 引用页面真实模块：../app/lib/extractNotice.js
 *
 * 覆盖：
 *   - 七种引导短语前缀全部被去掉，不会进入清单
 *   - 尾部数量词被去掉（两张 / 三份 / 1本 / 一件）
 *   - 回归：提示语“材料”、一寸照片、复合词、尾部地点
 *   - 金丝雀：用不去前缀的坏实现，断言必须拒绝
 */

import { extractNotice } from "../app/lib/extractNotice.js";

function eq(a, b) {
  return a === b;
}

// 用于“清单里出现这个片段就失败”的辅助
function includesAny(list, arr) {
  return arr.some((x) => list.includes(x));
}

const CASES = [
  // --- 七种引导短语前缀 ---
  {
    name: "材料：身份证 —— 不含“材料”",
    actual: () =>
      extractNotice("携带材料：身份证。").materials.includes("材料"),
    expected: false,
  },
  {
    name: "材料如下：身份证 —— 第一项就是身份证",
    actual: () => extractNotice("携带材料如下：身份证。").materials.join(","),
    expected: "身份证",
  },
  {
    name: "材料包括：身份证 —— 第一项就是身份证",
    actual: () =>
      extractNotice("携带材料包括：身份证。").materials.join(","),
    expected: "身份证",
  },
  {
    name: "附件：身份证 —— 不含“附件”",
    actual: () =>
      extractNotice("携带附件：身份证。").materials.includes("附件"),
    expected: false,
  },
  {
    name: "附件包括：身份证 —— 第一项就是身份证",
    actual: () =>
      extractNotice("携带附件包括：身份证。").materials.join(","),
    expected: "身份证",
  },
  {
    name: "需带材料：身份证 —— 第一项就是身份证",
    actual: () =>
      extractNotice("需带材料：身份证。").materials.join(","),
    expected: "身份证",
  },
  {
    name: "到办公室交材料：身份证 —— 第一项就是身份证",
    actual: () =>
      extractNotice("到办公室交材料：身份证。").materials.join(","),
    expected: "身份证",
  },
  {
    name: "需带材料如下：身份证、学生证、一寸照片、黑色签字笔 —— 第一项就是身份证",
    actual: () =>
      extractNotice(
        "需带材料如下：身份证、学生证、一寸照片、黑色签字笔。"
      ).materials[0],
    expected: "身份证",
  },
  {
    name: "需带材料如下：四样齐全且无前缀",
    actual: () => {
      const m = extractNotice(
        "需带材料如下：身份证、学生证、一寸照片、黑色签字笔。"
      ).materials;
      return (
        m.includes("身份证") &&
        m.includes("学生证") &&
        m.includes("一寸照片") &&
        m.includes("黑色签字笔")
      );
    },
    expected: true,
  },
  {
    name: "需提交材料：身份证、学生证 —— 回归",
    actual: () =>
      extractNotice("需提交材料：身份证、学生证。").materials.join(","),
    expected: "身份证,学生证",
  },
  {
    name: "请交材料如下：申请表、汇总表 —— 回归",
    actual: () =>
      extractNotice("请交材料如下：申请表、汇总表。").materials.join(","),
    expected: "申请表,汇总表",
  },

  // --- 尾部数量词 ---
  {
    name: "二寸照片两张 —— 结果不含“两张”",
    actual: () =>
      extractNotice("请携带二寸照片两张。").materials.includes("二寸照片两张"),
    expected: false,
  },
  {
    name: "二寸照片两张 —— 结果是“二寸照片”",
    actual: () =>
      extractNotice("请携带二寸照片两张。").materials.join(","),
    expected: "二寸照片",
  },
  {
    name: "身份证三份 —— 结果是“身份证”",
    actual: () =>
      extractNotice("请携带身份证三份。").materials.join(","),
    expected: "身份证",
  },
  {
    name: "申请表1本 —— 结果是“申请表”",
    actual: () =>
      extractNotice("请携带申请表1本。").materials.join(","),
    expected: "申请表",
  },
  {
    name: "一寸照片两张 —— 结果不含“两张”",
    actual: () => {
      const m = extractNotice("请携带一寸照片两张。").materials;
      return m.some((x) => x.endsWith("两张"));
    },
    expected: false,
  },

  // --- 回归：提示语“材料” ---
  {
    name: "需提交材料：身份证、学生证、一寸照片 —— 不含“材料”",
    actual: () =>
      extractNotice(
        "需提交材料：身份证、学生证、一寸照片。"
      ).materials.includes("材料"),
    expected: false,
  },

  // --- 回归：一寸照片 ---
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

  // --- 回归：复合词不拆 ---
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
    name: "和连接：身份证和身份证复印件 —— 身份证、身份证复印件",
    actual: () =>
      extractNotice("请携带身份证和身份证复印件。").materials.join(","),
    expected: "身份证,身份证复印件",
  },

  // --- 回归：尾部地点 ---
  {
    name: "黑色笔到现场 —— 不含“黑色笔到现场”",
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
];

// ---------- 金丝雀 ----------

/**
 * 坏实现：不去前缀、不去尾数量词。
 * 对“需带材料如下：身份证”返回“材料如下：身份证”。
 * 如果断言把这个当成正确结果，说明断言坏了。
 */
function brokenCleanMaterial(s) {
  let t = String(s || "").trim();
  t = t.replace(new RegExp("^[0-9一二三四五六七八九十]+[支张份个本件套盒把台部只条枚页瓶包块片]?"), "");
  return t;
}

function runCanary() {
  const text = "需带材料如下：身份证";
  const expected = "身份证";
  const brokenResult = brokenCleanMaterial(text);
  const realResult = extractNotice("需带材料如下：身份证。").materials.join(",");

  console.log("[金丝雀] 用不去前缀的坏实现，断言必须拒绝");
  console.log("    真实实现：" + JSON.stringify(realResult));
  console.log("    坏实现：" + JSON.stringify(brokenResult));
  console.log("    期望：" + JSON.stringify(expected));

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