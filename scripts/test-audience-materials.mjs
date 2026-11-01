/**
 * 面向对象 + 材料 自检
 * 用法：node scripts/test-audience-materials.mjs
 *
 * 引用页面真实模块：
 *   ../app/lib/extractNotice.js
 *   ../app/lib/aiExtract.js
 *
 * 验证：
 *   - 本地规则能识别“所有同学”“所有人”“@所有人”
 *   - 回归：全体同学、全校学生仍能识别
 *   - 原文三样材料时三样都识别
 *   - 合并策略：audience AI 优先；materials 整套用一边，不拼接
 *   - 金丝雀：用只匹配“全体”的坏 audience 规则，断言必须拒绝
 */

import { extractNotice } from "../app/lib/extractNotice.js";
import { mergeAIResult } from "../app/lib/aiExtract.js";

const LF = String.fromCharCode(10);

function eq(a, b) {
  return a === b;
}

const CASES = [
  // --- audience 本地规则 ---
  {
    name: "所有同学",
    actual: () => extractNotice("所有同学，都要参加。").audience,
    expected: "所有同学",
  },
  {
    name: "所有人",
    actual: () => extractNotice("请所有人务必到场。").audience,
    expected: "所有人",
  },
  {
    name: "@所有人",
    actual: () => extractNotice("@所有人 下午三点开会。").audience,
    expected: "所有人",
  },
  {
    name: "@全体成员",
    actual: () => extractNotice("@全体成员 请查收。").audience,
    expected: "全体成员",
  },
  {
    name: "所有在校生",
    actual: () => extractNotice("所有在校生须完成选课。").audience,
    expected: "所有在校生",
  },
  {
    name: "回归：全体同学",
    actual: () => extractNotice("全体同学于上午八点集合。").audience,
    expected: "全体同学",
  },
  {
    name: "回归：全校学生",
    actual: () => extractNotice("全校学生须参加。").audience,
    expected: "全校学生",
  },
  {
    name: "回归：各班班长",
    actual: () => extractNotice("请各班班长准时参加。").audience,
    expected: "各班班长",
  },

  // --- materials 本地规则 ---
  {
    name: "带清单三样：身份证、选民证、黑色笔",
    actual: () => {
      const r = extractNotice(
        "请携带身份证和选民证，还要带一支黑色笔到现场。"
      );
      return r.materials.includes("身份证") &&
        r.materials.includes("选民证") &&
        r.materials.includes("黑色笔");
    },
    expected: true,
  },
  {
    name: "携带清单三样：身份证、学生证、照片",
    actual: () => {
      const r = extractNotice("请携带身份证、学生证、照片。");
      return (
        r.materials.includes("身份证") &&
        r.materials.includes("学生证") &&
        r.materials.includes("照片")
      );
    },
    expected: true,
  },
  {
    name: "三样材料数量 = 3",
    actual: () => {
      const r = extractNotice("请携带身份证、学生证、照片。");
      return r.materials.length;
    },
    expected: 3,
  },
  {
    name: "量词被去掉：一支黑色笔 → 黑色笔",
    actual: () => {
      const r = extractNotice("还要带一支黑色笔。");
      return r.materials.includes("黑色笔");
    },
    expected: true,
  },

  // --- 合并策略：audience AI 优先 ---
  {
    name: "合并：AI 给了 audience → 用 AI 的",
    actual: () =>
      mergeAIResult(
        { audience: "各班班长" },
        { audience: "所有在校生" }
      ).audience,
    expected: "所有在校生",
  },
  {
    name: "合并：AI 没给 audience → 用本地的",
    actual: () =>
      mergeAIResult(
        { audience: "各班班长" },
        { audience: null }
      ).audience,
    expected: "各班班长",
  },
  {
    name: "合并：AI 和本地都空 → null",
    actual: () =>
      mergeAIResult({ audience: null }, { audience: null }).audience,
    expected: null,
  },

  // --- 合并策略：materials 整套用一边 ---
  {
    name: "合并：AI 给了非空 materials → 整套用 AI",
    actual: () =>
      mergeAIResult(
        { materials: ["身份证"] },
        { materials: ["身份证", "选民证", "黑色笔"] }
      ).materials.join(","),
    expected: "身份证,选民证,黑色笔",
  },
  {
    name: "合并：AI materials 为空 → 整套用本地",
    actual: () =>
      mergeAIResult(
        { materials: ["身份证", "选民证"] },
        { materials: [] }
      ).materials.join(","),
    expected: "身份证,选民证",
  },
  {
    name: "合并：AI materials 为 null → 整套用本地",
    actual: () =>
      mergeAIResult(
        { materials: ["身份证"] },
        { materials: null }
      ).materials.join(","),
    expected: "身份证",
  },
  {
    name: "合并：绝不拼接（AI 有值时本地不混入）",
    actual: () => {
      const m = mergeAIResult(
        { materials: ["本地独有的材料"] },
        { materials: ["AI材料一", "AI材料二"] }
      ).materials;
      return m.includes("本地独有的材料");
    },
    expected: false,
  },
];

// ---------- 金丝雀 ----------

/**
 * 坏实现：audience 只认“全体”和“全校”。
 * 对“所有同学”返回 null。
 * 如果断言把这个 null 当成正确结果，说明断言坏了。
 */
function brokenAudience(text) {
  const m = text.match(new RegExp("(全体[一-龥]{0,8}?(?:学生|师生|同学))"));
  return m ? m[1] : null;
}

function runCanary() {
  const text = "所有同学，都要参加。";
  const real = extractNotice(text).audience;
  const broken = brokenAudience(text);
  const expected = "所有同学";

  console.log("[金丝雀] 用只匹配“全体”的坏规则，断言必须拒绝");
  console.log("    真实实现：" + JSON.stringify(real));
  console.log("    坏实现：" + JSON.stringify(broken));
  console.log("    期望：" + JSON.stringify(expected));

  const wouldPass = eq(broken, expected);
  if (wouldPass) {
    console.log("    BROKEN - 坏实现被错误判为返回了正确 audience");
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
    "[" +
      (i + 1) +
      "/" +
      CASES.length +
      "] " +
      (ok ? "PASS" : "FAIL") +
      " - " +
      c.name
  );
  console.log("    期望：" + JSON.stringify(c.expected));
  console.log("    实际：" + JSON.stringify(actual));
  console.log("");
}

const canaryOk = runCanary();
console.log("");

console.log(
  "业务结果：" +
    pass +
    " 通过 / " +
    fail +
    " 失败 / 共 " +
    CASES.length +
    " 条"
);
console.log(
  "金丝雀结果：" +
    (canaryOk ? "按预期 FAIL（断言逻辑正常）" : "异常 PASS（断言逻辑已坏）")
);

if (fail > 0 || !canaryOk) {
  process.exitCode = 1;
}