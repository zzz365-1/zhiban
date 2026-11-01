/**
 * 模式匹配提醒 自检
 * 用法：node scripts/test-mode-guard.mjs
 *
 * 引用页面真实模块：../app/lib/modeGuard.js
 *
 * 覆盖：
 *   - 单条模式 + 单条内容：不提醒
 *   - 单条模式 + 三条内容：提醒切换到多通知
 *   - 单条模式 + 两条标题分隔：提醒切换到多通知
 *   - 多通知模式 + 单条内容：提醒切换到单条
 *   - 多通知模式 + 三条内容：不提醒
 *   - 空文本：不提醒
 *   - 拿不准的文本（长文本 + 多个请于但无边界）：不提醒
 *   - 带编号列表的单条通知：不提醒
 *   - 金丝雀：永远返回 shouldWarn=true 的坏实现，断言必须拒绝
 */

import { checkModeMismatch } from "../app/lib/modeGuard.js";

const LF = String.fromCharCode(10);

function eq(a, b) {
  return a === b;
}

const ONE_NOTICE =
  "关于XX的通知" + LF + "请于11月15日前完成材料报送。";

const THREE_BLANK =
  "通知A内容" + LF + LF + "通知B内容" + LF + LF + "通知C内容";

const THREE_HEADER =
  "关于开展消防演练的通知" +
  LF +
  "请各班于11月2日前完成。" +
  LF +
  "关于报送助学金材料的通知" +
  LF +
  "请各学院于11月15日前提交。" +
  LF +
  "关于举办读书月的通知" +
  LF +
  "请各班于11月8日前报名。";

// 长文本 + 多个请于，但无空行无多标题：splitNotices 返回 ok:false（拿不准）
const AMBIGUOUS = (() => {
  let text = "通知内容开始。" + LF;
  for (let i = 0; i < 10; i++) {
    text += "请于11月" + (i + 1) + "日前完成第" + (i + 1) + "项报送任务。";
  }
  return text;
})();

// 带编号列表的单条通知：splitNotices 识别为单条
const NUMBERED_SINGLE =
  "关于期末教学检查各项材料报送的通知" +
  LF +
  "一、请于11月10日前报送教学进度表。" +
  LF +
  "二、请于11月12日前报送听课记录表。" +
  LF +
  "三、请于11月15日前报送学生成绩单。" +
  LF +
  "四、请于11月20日前报送课程总结。";

const CASES = [
  {
    name: "单条模式 + 单条内容：不提醒",
    actual: () => checkModeMismatch(ONE_NOTICE, "single").shouldWarn,
    expected: false,
  },
  {
    name: "单条模式 + 三条空行分隔：提醒",
    actual: () => checkModeMismatch(THREE_BLANK, "single").shouldWarn,
    expected: true,
  },
  {
    name: "单条模式 + 三条空行分隔：检测条数 = 3",
    actual: () => checkModeMismatch(THREE_BLANK, "single").detectedCount,
    expected: 3,
  },
  {
    name: "单条模式 + 三条空行分隔：建议模式 = multi",
    actual: () =>
      checkModeMismatch(THREE_BLANK, "single").suggestedMode,
    expected: "multi",
  },
  {
    name: "单条模式 + 两条标题分隔：提醒",
    actual: () => checkModeMismatch(THREE_HEADER, "single").shouldWarn,
    expected: true,
  },
  {
    name: "单条模式 + 两条标题分隔：检测条数 = 3",
    actual: () =>
      checkModeMismatch(THREE_HEADER, "single").detectedCount,
    expected: 3,
  },
  {
    name: "多通知模式 + 单条内容：提醒",
    actual: () => checkModeMismatch(ONE_NOTICE, "multi").shouldWarn,
    expected: true,
  },
  {
    name: "多通知模式 + 单条内容：建议模式 = single",
    actual: () => checkModeMismatch(ONE_NOTICE, "multi").suggestedMode,
    expected: "single",
  },
  {
    name: "多通知模式 + 三条空行分隔：不提醒",
    actual: () => checkModeMismatch(THREE_BLANK, "multi").shouldWarn,
    expected: false,
  },
  {
    name: "空文本：不提醒",
    actual: () => checkModeMismatch("", "single").shouldWarn,
    expected: false,
  },
  {
    name: "只有空白：不提醒",
    actual: () => checkModeMismatch(LF + LF + "   ", "single").shouldWarn,
    expected: false,
  },
  {
    name: "拿不准的文本 + 单条模式：不提醒",
    actual: () => checkModeMismatch(AMBIGUOUS, "single").shouldWarn,
    expected: false,
  },
  {
    name: "拿不准的文本 + 多通知模式：不提醒",
    actual: () => checkModeMismatch(AMBIGUOUS, "multi").shouldWarn,
    expected: false,
  },
  {
    name: "带编号列表的单条通知 + 单条模式：不提醒",
    actual: () => checkModeMismatch(NUMBERED_SINGLE, "single").shouldWarn,
    expected: false,
  },
  {
    name: "带编号列表的单条通知 + 多通知模式：提醒（检测为 1 条）",
    actual: () => checkModeMismatch(NUMBERED_SINGLE, "multi").shouldWarn,
    expected: true,
  },
];

// ---------- 金丝雀 ----------

/**
 * 坏实现：永远返回 shouldWarn=true。
 * 对“单条模式 + 单条内容”（期望 false）会错误地提醒。
 * 如果断言把这个当成正确结果，说明断言坏了。
 */
function brokenCheck() {
  return {
    shouldWarn: true,
    detectedCount: 1,
    suggestedMode: "multi",
    message: "broken",
  };
}

function runCanary() {
  console.log("[金丝雀] 用永远提醒的坏实现，断言必须拒绝");
  const wouldPass = eq(brokenCheck().shouldWarn, false);

  if (wouldPass) {
    console.log("    BROKEN - 坏实现的 shouldWarn 被错误判为 false");
    console.log("    结论：异常 PASS - 断言逻辑已坏！");
    return false;
  }

  console.log("    坏实现 shouldWarn = true（正确期望 false）");
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