/**
 * 批量分割 + 去重自检
 * 用法：node scripts/test-batch.mjs
 *
 * 直接引用页面真实在用的模块：
 *   ../app/lib/splitNotices.js
 *
 * 验证：
 *   - 空行分隔：2 条、3 条
 *   - 标题分隔：无空行但有多个“关于……的通知”
 *   - 单条：只有一块，返回 1 条
 *   - 空输入、可疑长文本：返回 ok: false
 *   - 去重：相同文本 true，空白差异 true，不同文本 false
 *   - 金丝雀：用“永远返回 1 条”的坏 split，对多条文本的断言必须拒绝
 */

import {
  splitNotices,
  isDuplicate,
  normalizeForDedup,
} from "../app/lib/splitNotices.js";

const LF = String.fromCharCode(10);

function eq(a, b) {
  return a === b;
}

const CASES = [
  // --- 空行分隔 ---
  {
    name: "空行分隔 2 条",
    actual: () => {
      const r = splitNotices("通知A内容" + LF + LF + "通知B内容");
      return r.ok ? r.items.length : "err:" + r.reason;
    },
    expected: 2,
  },
  {
    name: "空行分隔 3 条",
    actual: () => {
      const r = splitNotices(
        "通知A" + LF + LF + "通知B" + LF + LF + "通知C"
      );
      return r.ok ? r.items.length : "err";
    },
    expected: 3,
  },
  {
    name: "空行分隔首尾空行不影响",
    actual: () => {
      const r = splitNotices(LF + LF + "通知A" + LF + LF + "通知B" + LF + LF);
      return r.ok ? r.items.length : "err";
    },
    expected: 2,
  },

  // --- 标题分隔 ---
  {
    name: "无空行，按“关于……的通知”标题分隔 2 条",
    actual: () => {
      const text =
        "关于开展消防演练的通知" +
        LF +
        "请各班于11月2日前完成。" +
        LF +
        "关于报送助学金材料的通知" +
        LF +
        "请各学院于11月15日前提交。";
      const r = splitNotices(text);
      return r.ok ? r.items.length : "err";
    },
    expected: 2,
  },
  {
    name: "标题分隔后第一条包含自己的正文",
    actual: () => {
      const text =
        "关于开展消防演练的通知" +
        LF +
        "请各班于11月2日前完成。" +
        LF +
        "关于报送助学金材料的通知" +
        LF +
        "请各学院于11月15日前提交。";
      const r = splitNotices(text);
      return r.ok ? r.items[0].includes("请各班于11月2日前完成") : "err";
    },
    expected: true,
  },
  {
    name: "标题分隔后第二条包含自己的正文",
    actual: () => {
      const text =
        "关于开展消防演练的通知" +
        LF +
        "请各班于11月2日前完成。" +
        LF +
        "关于报送助学金材料的通知" +
        LF +
        "请各学院于11月15日前提交。";
      const r = splitNotices(text);
      return r.ok ? r.items[1].includes("请各学院于11月15日前提交") : "err";
    },
    expected: true,
  },

  // --- 单条 ---
  {
    name: "单条内容（只有一段）返回 1 条",
    actual: () => {
      const r = splitNotices("关于XX的通知" + LF + "请于11月15日前完成。");
      return r.ok ? r.items.length : "err";
    },
    expected: 1,
  },
  {
    name: "单条内容 method = single",
    actual: () => {
      const r = splitNotices("关于XX的通知" + LF + "请于11月15日前完成。");
      return r.ok ? r.method : "err";
    },
    expected: "single",
  },

  // --- 空输入 ---
  {
    name: "空输入返回 ok: false",
    actual: () => splitNotices("").ok,
    expected: false,
  },
  {
    name: "只有空白返回 ok: false",
    actual: () => splitNotices(LF + LF + LF + "   " + LF).ok,
    expected: false,
  },

  // --- 可疑多条分不开 ---
  {
    name: "长文本 + 多个“请于”但无边界：返回 ok: false",
    actual: () => {
      let text = "通知内容开始。" + LF;
      for (let i = 0; i < 10; i++) {
        text +=
          "请于11月" + (i + 1) + "日前完成第" + (i + 1) + "项报送任务。"; 
      }
      return splitNotices(text).ok;
    },
    expected: false,
  },
  {
    name: "可疑长文本的 reason 包含“找不到明确的分隔边界”",
    actual: () => {
      let text = "通知内容开始。" + LF;
      for (let i = 0; i < 10; i++) {
        text +=
          "请于11月" + (i + 1) + "日前完成第" + (i + 1) + "项报送任务。"; 
      }
      const r = splitNotices(text);
      return r.ok ? "err" : r.reason.includes("找不到明确的分隔边界");
    },
    expected: true,
  },

  // --- 去重 ---
  {
    name: "去重：完全相同返回 true",
    actual: () =>
      isDuplicate("关于XX的通知" + LF + "正文", [
        { text: "关于XX的通知" + LF + "正文" },
      ]),
    expected: true,
  },
  {
    name: "去重：空白差异视为相同",
    actual: () =>
      isDuplicate("关于XX的通知  正文", [{ text: "关于XX的通知" + LF + "正文" }]),
    expected: true,
  },
  {
    name: "去重：不同文本返回 false",
    actual: () =>
      isDuplicate("另一条通知", [{ text: "关于XX的通知" + LF + "正文" }]),
    expected: false,
  },
  {
    name: "去重：空列表返回 false",
    actual: () => isDuplicate("任何内容", []),
    expected: false,
  },
  {
    name: "去重：空文本返回 false",
    actual: () => isDuplicate("", [{ text: "任何内容" }]),
    expected: false,
  },
  {
    name: "规范化：连续空白折叠为单空格",
    actual: () =>
      normalizeForDedup("A" + LF + LF + "B" + LF + "C"),
    expected: "A B C",
  },
];

// ---------- 金丝雀 ----------

/**
 * 坏实现：永远返回 1 条，不管输入有几条。
 * 用它去跑真实的多条用例，断言必须 FAIL。
 * 如果断言把 1 当成 2，说明断言逻辑坏了。
 */
function brokenSplit() {
  return { ok: true, items: ["整段文本"], method: "broken" };
}

function runCanary() {
  const twoNotices = "通知A内容" + LF + LF + "通知B内容";
  const realCount = splitNotices(twoNotices).items.length;
  const brokenCount = brokenSplit(twoNotices).items.length;
  const expectedCount = 2;

  console.log("[金丝雀] 用坏的 split（永远返回 1 条），断言必须拒绝");
  console.log("    真实实现返回 " + realCount + " 条");
  console.log("    坏实现返回 " + brokenCount + " 条");
  console.log("    期望 " + expectedCount + " 条");

  const wouldPass = eq(brokenCount, expectedCount);
  if (wouldPass) {
    console.log("    BROKEN - 坏实现被错误判为返回 " + expectedCount + " 条");
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