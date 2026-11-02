/**
 * 分类白名单 + 错误原因 + 端到端日期 自检
 * 用法：node scripts/test-classify.mjs
 *
 * 引用页面真实模块：
 *   ../app/lib/aiExtract.js    （分类校验、错误码、isFuzzyDate、mergeAIResult）
 *   ../app/lib/extractNotice.js（从原文抽 deadline）
 *   ../app/lib/relativeDate.js （本地换算）
 *
 * 覆盖：
 *   - 分类白名单：五个合法值保留，其他一律 null
 *   - 错误码 → 短标签、完整说明
 *   - isFuzzyDate 能认出“这个星期三”“下个星期三”“下下个星期三”等
 *   - 端到端：「这个星期三」原文→具体日期，不被原样显示
 *   - 金丝雀：用真实的 mergeAIResult 喂非法分类，断言必须抓到差异
 */

import {
  VALID_CATEGORIES,
  normalizeCategory,
  shortParseErrorLabel,
  describeParseError,
  mergeAIResult,
  isFuzzyDate,
} from "../app/lib/aiExtract.js";
import { extractNotice } from "../app/lib/extractNotice.js";
import { resolveRelativeDate } from "../app/lib/relativeDate.js";

function eq(a, b) {
  return a === b;
}

const NOW_SUNDAY = new Date(2026, 10, 1); // 2026-11-01 周日

const CASES = [
  // --- 合法分类 ---
  { name: '合法分类 "教务" 保留', actual: () => normalizeCategory("教务"), expected: "教务" },
  { name: '合法分类 "活动" 保留', actual: () => normalizeCategory("活动"), expected: "活动" },
  { name: '合法分类 "行政" 保留', actual: () => normalizeCategory("行政"), expected: "行政" },
  { name: '合法分类 "后勤" 保留', actual: () => normalizeCategory("后勤"), expected: "后勤" },
  { name: '合法分类 "其他" 保留', actual: () => normalizeCategory("其他"), expected: "其他" },

  // --- 非法分类 ---
  { name: '非法分类 "球赛" → null', actual: () => normalizeCategory("球赛"), expected: null },
  { name: '非法分类 "教学" → null', actual: () => normalizeCategory("教学"), expected: null },
  { name: '非法分类 "教务通知" → null（不做模糊匹配）', actual: () => normalizeCategory("教务通知"), expected: null },
  { name: '分类 "教务 " 带空格 → 保留 "教务"', actual: () => normalizeCategory("教务 "), expected: "教务" },
  { name: "分类 null → null", actual: () => normalizeCategory(null), expected: null },
  { name: "分类 undefined → null", actual: () => normalizeCategory(undefined), expected: null },
  { name: "分类空字符串 → null", actual: () => normalizeCategory(""), expected: null },
  { name: "分类数字 123 → null", actual: () => normalizeCategory(123), expected: null },

  // --- VALID_CATEGORIES 内容 ---
  { name: "白名单共 5 个", actual: () => VALID_CATEGORIES.length, expected: 5 },
  { name: "白名单内容", actual: () => VALID_CATEGORIES.join(","), expected: "教务,活动,行政,后勤,其他" },

  // --- 错误短标签 ---
  { name: '短标签 no_key = "未配密钥"', actual: () => shortParseErrorLabel("no_key"), expected: "未配密钥" },
  { name: '短标签 timeout = "响应超时"', actual: () => shortParseErrorLabel("timeout"), expected: "响应超时" },
  { name: '短标签 network_error = "网络异常"', actual: () => shortParseErrorLabel("network_error"), expected: "网络异常" },
  { name: '短标签 empty_content = "返回为空"', actual: () => shortParseErrorLabel("empty_content"), expected: "返回为空" },
  { name: '短标签 invalid_json = "格式异常"', actual: () => shortParseErrorLabel("invalid_json"), expected: "格式异常" },
  { name: '短标签 upstream_500 = "服务异常"', actual: () => shortParseErrorLabel("upstream_500"), expected: "服务异常" },
  { name: '短标签未知 = "调用失败"', actual: () => shortParseErrorLabel("unknown"), expected: "调用失败" },

  // --- 错误完整说明 ---
  { name: '完整说明 no_key 包含“密钥”', actual: () => describeParseError("no_key").includes("密钥"), expected: true },
  { name: '完整说明 no_key 包含“DEEPSEEK_API_KEY”（开发者可搜）', actual: () => describeParseError("no_key").includes("DEEPSEEK_API_KEY"), expected: true },
  { name: '完整说明 timeout 包含“超时”', actual: () => describeParseError("timeout").includes("超时"), expected: true },
  { name: '完整说明 network_error 包含“网络”', actual: () => describeParseError("network_error").includes("网络"), expected: true },
  { name: '完整说明 invalid_json 包含“JSON”', actual: () => describeParseError("invalid_json").includes("JSON"), expected: true },
  { name: '完整说明 upstream_502 包含“502”', actual: () => describeParseError("upstream_502").includes("502"), expected: true },

  // --- mergeAIResult 端到端 ---
  { name: "mergeAIResult：AI 返回合法分类 → 保留", actual: () => mergeAIResult({}, { category: "教务" }).category, expected: "教务" },
  { name: "mergeAIResult：AI 返回非法分类 → null", actual: () => mergeAIResult({}, { category: "球赛" }).category, expected: null },
  { name: "mergeAIResult：AI 没返回分类 → null", actual: () => mergeAIResult({}, {}).category, expected: null },

  // --- isFuzzyDate 认得出所有本轮说法 ---
  { name: "isFuzzyDate 认「这个星期三」", actual: () => isFuzzyDate("这个星期三"), expected: true },
  { name: "isFuzzyDate 认「这个周三」", actual: () => isFuzzyDate("这个周三"), expected: true },
  { name: "isFuzzyDate 认「这个星期日」", actual: () => isFuzzyDate("这个星期日"), expected: true },
  { name: "isFuzzyDate 认「这个周日」", actual: () => isFuzzyDate("这个周日"), expected: true },
  { name: "isFuzzyDate 认「这一个星期三」", actual: () => isFuzzyDate("这一个星期三"), expected: true },
  { name: "isFuzzyDate 认「下个星期三」", actual: () => isFuzzyDate("下个星期三"), expected: true },
  { name: "isFuzzyDate 认「下一个星期三」", actual: () => isFuzzyDate("下一个星期三"), expected: true },
  { name: "isFuzzyDate 认「下一个周日」", actual: () => isFuzzyDate("下一个周日"), expected: true },
  { name: "isFuzzyDate 认「下下周三」", actual: () => isFuzzyDate("下下周三"), expected: true },
  { name: "isFuzzyDate 认「下下个星期三」", actual: () => isFuzzyDate("下下个星期三"), expected: true },
  { name: "isFuzzyDate 认「下周三」", actual: () => isFuzzyDate("下周三"), expected: true },
  { name: "isFuzzyDate 认「本周三」", actual: () => isFuzzyDate("本周三"), expected: true },
  { name: "isFuzzyDate 认「这周三」", actual: () => isFuzzyDate("这周三"), expected: true },
  { name: "isFuzzyDate 认「周三」（裸周几）", actual: () => isFuzzyDate("周三"), expected: true },
  { name: "isFuzzyDate 认「明天」", actual: () => isFuzzyDate("明天"), expected: true },
  { name: "isFuzzyDate 认「三天内」", actual: () => isFuzzyDate("三天内"), expected: true },
  { name: "isFuzzyDate 认「一个月后」", actual: () => isFuzzyDate("一个月后"), expected: true },
  { name: "isFuzzyDate 不认「2026年11月5日」（具体日期）", actual: () => isFuzzyDate("2026年11月5日"), expected: false },
  { name: "isFuzzyDate 不认空字符串", actual: () => isFuzzyDate(""), expected: false },

  // --- 端到端：「这个星期三」原文→具体日期 ---
  {
    name: "端到端：「这个星期三前交」→具体日期（不被原样显示）",
    actual: () => {
      const text = "请于这个星期三前将材料交至A101办公室。";
      const rule = extractNotice(text);
      if (!rule.deadline) return "FAIL: 未抽出 deadline";
      if (!isFuzzyDate(rule.deadline)) return "FAIL: isFuzzyDate 未识别 " + rule.deadline;
      const resolved = resolveRelativeDate(rule.deadline, NOW_SUNDAY);
      if (!resolved) return "FAIL: 本地未换算";
      if (resolved.normalized === rule.deadline) return "FAIL: 原样显示";
      return resolved.normalized;
    },
    expected: "2026年11月4日",
  },
  {
    name: "端到端：「下个星期三前交」→具体日期",
    actual: () => {
      const text = "请于下个星期三前将材料交至A101办公室。";
      const rule = extractNotice(text);
      if (!rule.deadline) return "FAIL: 未抽出 deadline";
      if (!isFuzzyDate(rule.deadline)) return "FAIL: isFuzzyDate 未识别 " + rule.deadline;
      const resolved = resolveRelativeDate(rule.deadline, NOW_SUNDAY);
      if (!resolved) return "FAIL: 本地未换算";
      if (resolved.normalized === rule.deadline) return "FAIL: 原样显示";
      return resolved.normalized;
    },
    expected: "2026年11月4日",
  },
  {
    name: "端到端：「下下周三前交」→具体日期",
    actual: () => {
      const text = "请于下下周三前将材料交至A101办公室。";
      const rule = extractNotice(text);
      if (!rule.deadline) return "FAIL: 未抽出 deadline";
      if (!isFuzzyDate(rule.deadline)) return "FAIL: isFuzzyDate 未识别 " + rule.deadline;
      const resolved = resolveRelativeDate(rule.deadline, NOW_SUNDAY);
      if (!resolved) return "FAIL: 本地未换算";
      if (resolved.normalized === rule.deadline) return "FAIL: 原样显示";
      return resolved.normalized;
    },
    expected: "2026年11月11日",
  },

  // --- 035 本地分类兜底 ---
  // 分类一直只有模型会填，无密钥时这一行是空的。这里盯住本地兜底。
  {
    name: "035 本地分类：学籍核对 → 教务",
    actual: () => extractNotice("请于11月12日前登录教务系统核对个人学籍信息。").category,
    expected: "教务",
  },
  {
    name: "035 本地分类：宿舍检查 → 后勤（不被安全这个词抢走）",
    actual: () =>
      extractNotice("11月20日上午9点起对全校学生宿舍进行安全卫生检查。").category,
    expected: "后勤",
  },
  {
    name: "035 本地分类：主题班会 → 行政（不被考试这个词抢走）",
    actual: () =>
      extractNotice("各班于下周三下午4点召开诚信考试主题班会。").category,
    expected: "行政",
  },
  {
    name: "035 本地分类：歌手大赛 → 活动",
    actual: () =>
      extractNotice("第十五届校园歌手大赛报名截止11月10日17:00。").category,
    expected: "活动",
  },
  {
    name: "035 本地分类：助学金评审 → 行政",
    actual: () =>
      extractNotice("关于2026年国家助学金评审工作安排的通知，评审会定于11月8日。")
        .category,
    expected: "行政",
  },
  {
    name: "035 本地分类：认不出来的给 null，不乱猜（防误杀）",
    actual: () => extractNotice("请各位同学相互转告，谢谢配合。").category,
    expected: null,
  },
];

// ---------- 金丝雀 ----------

/**
 * 【金丝雀为什么要用真实的生产代码】
 * 上一版的金丝雀自己造了一个假 merge 函数，然后检查
 * VALID_CATEGORIES.includes("球赛")——这跟生产代码没有任何关系。
 * 如果某天 normalizeCategory 被改坏成直通，金丝雀照样说“正常”。
 * 这一版直接用真实的 mergeAIResult 喂非法值，同时构造一个故意错的
 * 期望（期望它返回“球赛”）。如果真实实现真的返回“球赛”，说明白名单
 * 校验失效；如果 eq 被改坏成永远返回 true，金丝雀也立刻报 BROKEN。
 * 两个方向都盯住，才算真正的“金丝雀”。
 */
function runCanary() {
  // 用真实的生产代码 mergeAIResult
  const actual = mergeAIResult({}, { category: "球赛" }).category;

  // 故意写一个错误期望
  const wrongExpected = "球赛";

  console.log("[金丝雀] 用真实 mergeAIResult 喂非法分类，断言必须抓到差异");
  console.log("    真实 merge 返回：" + JSON.stringify(actual));
  console.log("    错误期望：" + JSON.stringify(wrongExpected));

  const wouldPass = eq(actual, wrongExpected);
  if (wouldPass) {
    // 真实代码返回了“球赛”，或者 eq 被改成永远 true
    console.log("    BROKEN - 真实实现返回了非法分类，或断言逻辑已坏");
    console.log("    结论：异常 PASS - 断言逻辑已坏！");
    return false;
  }

  console.log("    真实 merge 正确返回 null（非法值被拦）");
  console.log("    错误期望被断言拒绝（正确）");
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