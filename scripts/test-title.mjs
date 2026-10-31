/**
 * 标题显示自检
 * 用法：node scripts/test-title.mjs
 *
 * 引用页面真实在用的模块：
 *   ../app/lib/shareText.js  （getNoticeTitle）
 *   ../app/lib/noticeOps.js  （updateNoticeAnalysis）
 *
 * AnalysisPanel 里标题格子也调用 getNoticeTitle，
 * 所以这里验证的正是界面上显示的逻辑。
 *
 * 验证：
 *   - 有模型：优先用 analysis.title
 *   - 无模型：回退到 notice.title
 *   - 草稿（未保存）：回退到原文第一行
 *   - 人工改过标题：以人工改的为准
 *   - 全部为空：兜底“未命名通知”
 *   - 第一行为空：取第一个非空行
 *   - 超长截断
 *   - 金丝雀：只读 analysis.title 的坏实现必须被拒绝
 */

import { getNoticeTitle } from "../app/lib/shareText.js";
import { updateNoticeAnalysis } from "../app/lib/noticeOps.js";

const LF = String.fromCharCode(10);

function eq(a, b) {
  return a === b;
}

const CASES = [
  {
    name: "AI 辅助的通知：优先用 analysis.title",
    actual: () =>
      getNoticeTitle({
        analysis: { title: "模型生成的标题" },
        title: "保存时的派生标题",
        text: "原文第一行" + LF + "其余内容",
      }),
    expected: "模型生成的标题",
  },
  {
    name: "本地规则的通知：回退到 notice.title",
    actual: () =>
      getNoticeTitle({
        analysis: { title: null },
        title: "通知原文第一行",
        text: "通知原文第一行" + LF + "正文",
      }),
    expected: "通知原文第一行",
  },
  {
    name: "草稿（未保存）：回退到原文第一行",
    actual: () =>
      getNoticeTitle({
        analysis: { title: null },
        title: null,
        text: "关于开展消防演练的通知" + LF + "正文内容",
      }),
    expected: "关于开展消防演练的通知",
  },
  {
    name: "人工改过标题：以人工改的为准",
    actual: () =>
      getNoticeTitle({
        analysis: { title: "人工改过的标题" },
        title: "旧标题",
        text: "原文第一行" + LF + "正文",
      }),
    expected: "人工改过的标题",
  },
  {
    name: "端到端：手动修改标题后 getNoticeTitle 生效",
    actual: () => {
      const notice = {
        id: "n1",
        title: "旧标题",
        text: "旧标题" + LF + "正文",
        analysis: { title: null, deadline: null, time: null },
        deadlineDate: null,
      };
      const u = updateNoticeAnalysis(notice, { title: "新标题" });
      return getNoticeTitle(u);
    },
    expected: "新标题",
  },
  {
    name: "全部为空：兜底“未命名通知”",
    actual: () =>
      getNoticeTitle({
        analysis: { title: null },
        title: null,
        text: "",
      }),
    expected: "未命名通知",
  },
  {
    name: "第一行为空：取第一个非空行",
    actual: () =>
      getNoticeTitle({
        analysis: { title: null },
        title: null,
        text: LF + LF + "真正的标题" + LF + "正文",
      }),
    expected: "真正的标题",
  },
  {
    name: "超长原文第一行被截断到 41 字符",
    actual: () => {
      const long = "很长的标题".repeat(10); // 50 字
      const t = getNoticeTitle({
        analysis: { title: null },
        title: null,
        text: long,
      });
      return t.length;
    },
    expected: 41,
  },
];

// ---------- 金丝雀 ----------

/**
 * 坏实现：只读 analysis.title，不兜底。
 * 对本地规则的通知会返回 null。
 * 真实实现应该返回原文第一行。
 * 如果断言把这个 null 当成正确标题，说明断言逻辑坏了。
 */
function brokenTitleGetter(notice) {
  return notice.analysis && notice.analysis.title
    ? notice.analysis.title
    : null;
}

function runCanary() {
  const notice = {
    analysis: { title: null },
    title: "通知原文第一行",
    text: "通知原文第一行" + LF + "正文",
  };
  const expected = "通知原文第一行";
  const brokenResult = brokenTitleGetter(notice);
  const realResult = getNoticeTitle(notice);

  console.log("[金丝雀] 用只读 analysis.title 的坏实现，断言必须拒绝");
  const wouldPass = eq(brokenResult, expected);

  if (wouldPass) {
    console.log("    BROKEN - 坏实现被错误判为返回了正确标题");
    console.log("    结论：异常 PASS - 断言逻辑已坏！");
    return false;
  }

  console.log("    坏实现返回：" + JSON.stringify(brokenResult));
  console.log("    真实实现返回：" + JSON.stringify(realResult));
  console.log("    期望：" + JSON.stringify(expected));
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