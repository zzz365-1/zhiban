/**
 * 相对日期换算 自检（纯本地，不联网，不需要密钥）
 * 用法：node scripts/test-relative-dates.mjs
 *
 * 引用页面真实模块：
 *   ../app/lib/relativeDate.js   （本地换算）
 *   ../app/lib/extractNotice.js  （本地抽取）
 *
 * 覆盖：
 *   - 今天/明天/后天/大后天
 *   - 下周一 ~ 下周日，从不同 today 出发
 *   - 本周X / 这周X（已过则顺延）
 *   - 本月底/本月初/下月底/下月初
 *   - 本月X日 / 下月X日
 *   - X天内 / X天后 / 过X天（中文数字 + 阿拉伯数字）
 *   - X周内 / X周后 / X个星期内 / X个星期后
 *   - 跨月、跨年、闰年
 *   - 不支持的说法返回 null，不猜
 *   - 金丝雀：把“一周后”当成 5 个工作日的坏实现，断言必须拒绝
 */

import { resolveRelativeDate } from "../app/lib/relativeDate.js";
import { extractNotice } from "../app/lib/extractNotice.js";

function eq(a, b) {
  return a === b;
}

function d(y, m, day) {
  return new Date(y, m - 1, day);
}

function resolveOrNull(text, now) {
  const r = resolveRelativeDate(text, now);
  return r ? r.normalized : null;
}

const NOW_SUNDAY = d(2026, 11, 1);
const NOW_MONDAY = d(2026, 11, 2);
const NOW_WEDNESDAY = d(2026, 11, 4);
const NOW_SATURDAY = d(2026, 11, 7);
const NOW_JAN31 = d(2026, 1, 31);
const NOW_DEC31 = d(2025, 12, 31);
const NOW_FEB01 = d(2024, 2, 1);
const NOW_FEB27_LEAP = d(2024, 2, 27);
const NOW_FEB27_COMMON = d(2026, 2, 27);
const NOW_FEB28 = d(2026, 2, 28);

const CASES = [
  // --- 今天/明天/后天/大后天 ---
  { name: "今天（2026-11-01）", actual: () => resolveOrNull("今天", NOW_SUNDAY), expected: "2026年11月1日" },
  { name: "明天（2026-11-01）", actual: () => resolveOrNull("明天", NOW_SUNDAY), expected: "2026年11月2日" },
  { name: "后天（2026-11-01）", actual: () => resolveOrNull("后天", NOW_SUNDAY), expected: "2026年11月3日" },
  { name: "大后天（2026-11-01）", actual: () => resolveOrNull("大后天", NOW_SUNDAY), expected: "2026年11月4日" },

  // --- 下周三等 ---
  { name: "今天周日，下周三 = 11月4日", actual: () => resolveOrNull("下周三", NOW_SUNDAY), expected: "2026年11月4日" },
  { name: "今天周日，下周一 = 11月2日", actual: () => resolveOrNull("下周一", NOW_SUNDAY), expected: "2026年11月2日" },
  { name: "今天周日，下周日 = 11月8日", actual: () => resolveOrNull("下周日", NOW_SUNDAY), expected: "2026年11月8日" },
  { name: "今天周一，下周三 = 11月11日", actual: () => resolveOrNull("下周三", NOW_MONDAY), expected: "2026年11月11日" },
  { name: "今天周三，下周三 = 11月11日", actual: () => resolveOrNull("下周三", NOW_WEDNESDAY), expected: "2026年11月11日" },
  { name: "今天周六，下周三 = 11月11日", actual: () => resolveOrNull("下周三", NOW_SATURDAY), expected: "2026年11月11日" },

  // --- 本周X / 这周X ---
  { name: "今天周日，本周日 = 今天", actual: () => resolveOrNull("本周日", NOW_SUNDAY), expected: "2026年11月1日" },
  { name: "今天周日，本周三已过 → 11月4日", actual: () => resolveOrNull("本周三", NOW_SUNDAY), expected: "2026年11月4日" },
  { name: "今天周一，本周三 = 11月4日", actual: () => resolveOrNull("本周三", NOW_MONDAY), expected: "2026年11月4日" },

  // --- 本月底/月初 ---
  { name: "本月底（2026-11-01）= 11月30日", actual: () => resolveOrNull("本月底", NOW_SUNDAY), expected: "2026年11月30日" },
  { name: "下月底（2026-11-01）= 12月31日", actual: () => resolveOrNull("下月底", NOW_SUNDAY), expected: "2026年12月31日" },
  { name: "下月初（2026-11-01）= 12月1日", actual: () => resolveOrNull("下月初", NOW_SUNDAY), expected: "2026年12月1日" },
  { name: "下月底（2026-01-31）= 2月28日（平年）", actual: () => resolveOrNull("下月底", NOW_JAN31), expected: "2026年2月28日" },
  { name: "本月底（2024-02-01 闰年）= 2月29日", actual: () => resolveOrNull("本月底", NOW_FEB01), expected: "2024年2月29日" },

  // --- 本月X日 / 下月X日 ---
  { name: "本月25日（2026-11-01）= 11月25日", actual: () => resolveOrNull("本月25日", NOW_SUNDAY), expected: "2026年11月25日" },
  { name: "下月25日（2026-11-01）= 12月25日", actual: () => resolveOrNull("下月25日", NOW_SUNDAY), expected: "2026年12月25日" },
  { name: "本月25日（2026-11-26 已过）= null", actual: () => resolveOrNull("本月25日", d(2026, 11, 26)), expected: null },

  // --- X天内 / X天后 ---
  { name: "三天内（2026-11-01）= 11月4日", actual: () => resolveOrNull("三天内", NOW_SUNDAY), expected: "2026年11月4日" },
  { name: "三天后（2026-11-01）= 11月4日", actual: () => resolveOrNull("三天后", NOW_SUNDAY), expected: "2026年11月4日" },
  { name: "一天后（2026-11-01）= 11月2日", actual: () => resolveOrNull("一天后", NOW_SUNDAY), expected: "2026年11月2日" },
  { name: "两天后（2026-11-01）= 11月3日", actual: () => resolveOrNull("两天后", NOW_SUNDAY), expected: "2026年11月3日" },
  { name: "十天内（2026-11-01）= 11月11日", actual: () => resolveOrNull("十天内", NOW_SUNDAY), expected: "2026年11月11日" },
  { name: "十五天后（2026-11-01）= 11月16日", actual: () => resolveOrNull("十五天后", NOW_SUNDAY), expected: "2026年11月16日" },
  { name: "二十天内（2026-11-01）= 11月21日", actual: () => resolveOrNull("二十天内", NOW_SUNDAY), expected: "2026年11月21日" },
  { name: "过三天（2026-11-01）= 11月4日", actual: () => resolveOrNull("过三天", NOW_SUNDAY), expected: "2026年11月4日" },
  { name: "7天内（阿拉伯数字）= 11月8日", actual: () => resolveOrNull("7天内", NOW_SUNDAY), expected: "2026年11月8日" },
  { name: "3天后（阿拉伯数字）= 11月4日", actual: () => resolveOrNull("3天后", NOW_SUNDAY), expected: "2026年11月4日" },
  { name: "日之内：三日之内 = 11月4日", actual: () => resolveOrNull("三日之内", NOW_SUNDAY), expected: "2026年11月4日" },
  { name: "日以后：三天以后 = 11月4日", actual: () => resolveOrNull("三天以后", NOW_SUNDAY), expected: "2026年11月4日" },

  // --- X周内 / X周后 ---
  { name: "一周内（2026-11-01）= 11月8日", actual: () => resolveOrNull("一周内", NOW_SUNDAY), expected: "2026年11月8日" },
  { name: "一周后（2026-11-01）= 11月8日（7 个自然日）", actual: () => resolveOrNull("一周后", NOW_SUNDAY), expected: "2026年11月8日" },
  { name: "两周后（2026-11-01）= 11月15日", actual: () => resolveOrNull("两周后", NOW_SUNDAY), expected: "2026年11月15日" },
  { name: "三周内（2026-11-01）= 11月22日", actual: () => resolveOrNull("三周内", NOW_SUNDAY), expected: "2026年11月22日" },
  { name: "一个星期一后（2026-11-01）= 11月8日", actual: () => resolveOrNull("一个星期后", NOW_SUNDAY), expected: "2026年11月8日" },
  { name: "两个星期内（2026-11-01）= 11月15日", actual: () => resolveOrNull("两个星期内", NOW_SUNDAY), expected: "2026年11月15日" },

  // --- 跨月 ---
  { name: "跨月：2026-01-31 的明天 = 2月1日", actual: () => resolveOrNull("明天", NOW_JAN31), expected: "2026年2月1日" },
  { name: "跨月：2026-01-31 的三天内 = 2月3日", actual: () => resolveOrNull("三天内", NOW_JAN31), expected: "2026年2月3日" },
  { name: "跨月：2026-01-31 的下周三 = 2月4日", actual: () => resolveOrNull("下周三", NOW_JAN31), expected: "2026年2月4日" },
  { name: "跨月：2026-01-31 的一周后 = 2月7日", actual: () => resolveOrNull("一周后", NOW_JAN31), expected: "2026年2月7日" },

  // --- 跨年 ---
  { name: "跨年：2025-12-31 的明天 = 2026年1月1日", actual: () => resolveOrNull("明天", NOW_DEC31), expected: "2026年1月1日" },
  { name: "跨年：2025-12-31 的三天后 = 2026年1月3日", actual: () => resolveOrNull("三天后", NOW_DEC31), expected: "2026年1月3日" },
  { name: "跨年：2025-12-31 的一周后 = 2026年1月7日", actual: () => resolveOrNull("一周后", NOW_DEC31), expected: "2026年1月7日" },
  { name: "跨年：2025-12-31 的下周一 = 2026年1月5日", actual: () => resolveOrNull("下周一", NOW_DEC31), expected: "2026年1月5日" },
  { name: "跨年：2025-12-31 的下月底 = 2026年1月31日", actual: () => resolveOrNull("下月底", NOW_DEC31), expected: "2026年1月31日" },

  // --- 闰年 vs 平年月底 ---
  { name: "闰年：2024-02-27 三天内 = 3月1日（2月有29天）", actual: () => resolveOrNull("三天内", NOW_FEB27_LEAP), expected: "2024年3月1日" },
  { name: "平年：2026-02-27 三天内 = 3月2日（2月有28天）", actual: () => resolveOrNull("三天内", NOW_FEB27_COMMON), expected: "2026年3月2日" },
  { name: "平年：2026-02-28 明天 = 3月1日", actual: () => resolveOrNull("明天", NOW_FEB28), expected: "2026年3月1日" },

  // --- 不支持的说法返回 null，不猜 ---
  { name: "「半个月后」= null（不猜）", actual: () => resolveOrNull("半个月后", NOW_SUNDAY), expected: null },
  { name: "「几天后」= null", actual: () => resolveOrNull("几天后", NOW_SUNDAY), expected: null },
  { name: "「数天内」= null", actual: () => resolveOrNull("数天内", NOW_SUNDAY), expected: null },
  { name: "「一百天后」= null（超出支持范围）", actual: () => resolveOrNull("一百天后", NOW_SUNDAY), expected: null },
  { name: "「一千天内」= null（超出支持范围）", actual: () => resolveOrNull("一千天内", NOW_SUNDAY), expected: null },
  { name: "「下周」单独 = null", actual: () => resolveOrNull("下周", NOW_SUNDAY), expected: null },
  { name: "「月底」没说哪个月 = null", actual: () => resolveOrNull("月底", NOW_SUNDAY), expected: null },
  { name: "「近期」= null", actual: () => resolveOrNull("近期", NOW_SUNDAY), expected: null },
  { name: "「一周」单独（无内/后）= null", actual: () => resolveOrNull("一周", NOW_SUNDAY), expected: null },
  { name: "「三天」单独（无内/后）= null", actual: () => resolveOrNull("三天", NOW_SUNDAY), expected: null },
  { name: "空字符串 = null", actual: () => resolveOrNull("", NOW_SUNDAY), expected: null },

  // --- extractNotice + resolveRelativeDate 组合 ---
  { name: "组合：原文「三天内交」本地抽出「三天内」并换算", actual: () => {
      const rule = extractNotice("请在三天内把表交到教务处A101。");
      const r = resolveRelativeDate(rule.deadline, NOW_SUNDAY);
      return r ? r.normalized : null;
    }, expected: "2026年11月4日" },
  { name: "组合：原文「一周后报送」本地抽出「一周后」并换算", actual: () => {
      const rule = extractNotice("材料请于一周后报送至教务处A101。");
      const r = resolveRelativeDate(rule.deadline, NOW_SUNDAY);
      return r ? r.normalized : null;
    }, expected: "2026年11月8日" },
  { name: "组合：原文「下周三前交」本地抽出「下周三」并换算", actual: () => {
      const rule = extractNotice("请于下周三前将材料交至A101。");
      const r = resolveRelativeDate(rule.deadline, NOW_SUNDAY);
      return r ? r.normalized : null;
    }, expected: "2026年11月4日" },
  { name: "组合：原文「十天内完成」本地抽出「十天内」并换算", actual: () => {
      const rule = extractNotice("请于十天内完成缴费。");
      const r = resolveRelativeDate(rule.deadline, NOW_SUNDAY);
      return r ? r.normalized : null;
    }, expected: "2026年11月11日" },
];

// ---------- 金丝雀 ----------

/**
 * 坏实现：把“一周后”当成 5 个工作日。
 * 2026-11-02（周一）的“一周后”，坏实现给出 11月7日（周五），
 * 正确应为 11月9日（周一，7 个自然日）。
 * 如果断言把这个错值当成正确，说明断言坏了。
 */
function brokenResolveOneWeekLater(now) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 5);
  return (
    d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日"
  );
}

function runCanary() {
  const correct = resolveOrNull("一周后", NOW_MONDAY);
  const expected = "2026年11月9日";
  const broken = brokenResolveOneWeekLater(NOW_MONDAY);

  console.log("[金丝雀] 用「一周后 = 5 个工作日」的坏实现，断言必须拒绝");
  console.log("    正确实现：" + JSON.stringify(correct));
  console.log("    坏实现：" + JSON.stringify(broken));
  console.log("    期望：" + JSON.stringify(expected));

  const wouldPass = eq(broken, expected);
  if (wouldPass) {
    console.log("    BROKEN - 坏实现被错误判为与期望相等");
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