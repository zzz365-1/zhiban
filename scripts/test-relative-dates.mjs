/**
 * 相对日期换算 自检（纯本地，不联网，不需要密钥）
 * 用法：node scripts/test-relative-dates.mjs
 *
 * 引用页面真实模块：
 *   ../app/lib/relativeDate.js
 *   ../app/lib/extractNotice.js
 *
 * 覆盖：
 *   - 今天/明天/后天/大后天/次日/隔天/即日
 *   - 周几：裸“周X”、本周X、这周X、这个周X、这个星期X、这一个星期X、
 *     下X、下个X、下一个X、下一周X、下下周X、下下个X
 *   - 本月底/本月初/下月底/下月初、本月X日、下月X日
 *   - X天内/X天后/过X天、X周内/X周后/过X周、
 *     X个月内/X个月后/过X个月、X年内/X年后/过X年
 *   - 跨月、跨年、闰年、月底
 *   - 含糊说法返回 null，不猜
 *   - 多金丝雀：每个金丝雀跑多个基准日，全部都必须抓到错误才算通过
 */

import { resolveRelativeDate } from "../app/lib/relativeDate.js";
import { extractNotice } from "../app/lib/extractNotice.js";

function eq(a, b) {
  return a === b;
}

function d(y, m, day) {
  return new Date(y, m - 1, day);
}

function fmt(date) {
  return (
    date.getFullYear() +
    "年" +
    (date.getMonth() + 1) +
    "月" +
    date.getDate() +
    "日"
  );
}

function resolveOrNull(text, now) {
  const r = resolveRelativeDate(text, now);
  return r ? r.normalized : null;
}

const NOW_SUNDAY = d(2026, 11, 1);
const NOW_MONDAY = d(2026, 11, 2);
const NOW_WEDNESDAY = d(2026, 11, 4);
const NOW_SATURDAY = d(2026, 11, 7);
const NOW_JAN15 = d(2026, 1, 15);
const NOW_JAN31 = d(2026, 1, 31);
const NOW_MAR31 = d(2026, 3, 31);
const NOW_DEC31 = d(2025, 12, 31);
const NOW_NOV15_2025 = d(2025, 11, 15);
const NOW_FEB01 = d(2024, 2, 1);
const NOW_FEB27_LEAP = d(2024, 2, 27);
const NOW_FEB27_COMMON = d(2026, 2, 27);
const NOW_FEB28 = d(2026, 2, 28);

const CASES = [
  // --- 今天/明天/后天/大后天/次日/隔天/即日 ---
  { name: "今天（2026-11-01）", actual: () => resolveOrNull("今天", NOW_SUNDAY), expected: "2026年11月1日" },
  { name: "明天（2026-11-01）", actual: () => resolveOrNull("明天", NOW_SUNDAY), expected: "2026年11月2日" },
  { name: "后天（2026-11-01）", actual: () => resolveOrNull("后天", NOW_SUNDAY), expected: "2026年11月3日" },
  { name: "大后天（2026-11-01）", actual: () => resolveOrNull("大后天", NOW_SUNDAY), expected: "2026年11月4日" },
  { name: "次日（2026-11-01）= 11月2日", actual: () => resolveOrNull("次日", NOW_SUNDAY), expected: "2026年11月2日" },
  { name: "隔天（2026-11-01）= 11月2日", actual: () => resolveOrNull("隔天", NOW_SUNDAY), expected: "2026年11月2日" },
  { name: "即日（2026-11-01）= 11月1日", actual: () => resolveOrNull("即日", NOW_SUNDAY), expected: "2026年11月1日" },

  // --- 周几：裸周X ---
  { name: "今天周日，周三 = 11月4日", actual: () => resolveOrNull("周三", NOW_SUNDAY), expected: "2026年11月4日" },
  { name: "今天周日，星期三 = 11月4日", actual: () => resolveOrNull("星期三", NOW_SUNDAY), expected: "2026年11月4日" },
  { name: "今天周日，周日 = 今天", actual: () => resolveOrNull("周日", NOW_SUNDAY), expected: "2026年11月1日" },
  { name: "今天周一，周三 = 11月4日", actual: () => resolveOrNull("周三", NOW_MONDAY), expected: "2026年11月4日" },
  { name: "今天周三，周三 = 今天", actual: () => resolveOrNull("周三", NOW_WEDNESDAY), expected: "2026年11月4日" },

  // --- 本周X / 这周X ---
  { name: "今天周日，本周日 = 今天", actual: () => resolveOrNull("本周日", NOW_SUNDAY), expected: "2026年11月1日" },
  { name: "今天周日，这周日 = 今天", actual: () => resolveOrNull("这周日", NOW_SUNDAY), expected: "2026年11月1日" },
  { name: "今天周日，本周三已过 → 11月4日", actual: () => resolveOrNull("本周三", NOW_SUNDAY), expected: "2026年11月4日" },
  { name: "今天周一，本周三 = 11月4日", actual: () => resolveOrNull("本周三", NOW_MONDAY), expected: "2026年11月4日" },
  { name: "今天周三，本周三 = 今天", actual: () => resolveOrNull("本周三", NOW_WEDNESDAY), expected: "2026年11月4日" },

  // --- 这个星期三 / 这个周三 / 这一个星期三 ---
  { name: "今天周日，这个星期三 = 11月4日", actual: () => resolveOrNull("这个星期三", NOW_SUNDAY), expected: "2026年11月4日" },
  { name: "今天周日，这个周三 = 11月4日", actual: () => resolveOrNull("这个周三", NOW_SUNDAY), expected: "2026年11月4日" },
  { name: "今天周日，这个星期日 = 今天", actual: () => resolveOrNull("这个星期日", NOW_SUNDAY), expected: "2026年11月1日" },
  { name: "今天周日，这个周日 = 今天", actual: () => resolveOrNull("这个周日", NOW_SUNDAY), expected: "2026年11月1日" },
  { name: "今天周日，这一个星期三 = 11月4日", actual: () => resolveOrNull("这一个星期三", NOW_SUNDAY), expected: "2026年11月4日" },
  { name: "今天周一，这个星期三 = 11月4日", actual: () => resolveOrNull("这个星期三", NOW_MONDAY), expected: "2026年11月4日" },

  // --- 下个星期三 / 下一个星期三 ---
  { name: "今天周日，下个星期三 = 11月4日", actual: () => resolveOrNull("下个星期三", NOW_SUNDAY), expected: "2026年11月4日" },
  { name: "今天周日，下一个星期三 = 11月4日", actual: () => resolveOrNull("下一个星期三", NOW_SUNDAY), expected: "2026年11月4日" },
  { name: "今天周日，下个周三 = 11月4日", actual: () => resolveOrNull("下个周三", NOW_SUNDAY), expected: "2026年11月4日" },
  { name: "今天周日，下一个周日 = 11月8日", actual: () => resolveOrNull("下一个周日", NOW_SUNDAY), expected: "2026年11月8日" },
  { name: "今天周一，下个星期三 = 11月11日", actual: () => resolveOrNull("下个星期三", NOW_MONDAY), expected: "2026年11月11日" },
  { name: "今天周三，下个星期三 = 11月11日", actual: () => resolveOrNull("下个星期三", NOW_WEDNESDAY), expected: "2026年11月11日" },

  // --- 下周X / 下一周X ---
  { name: "今天周日，下周三 = 11月4日", actual: () => resolveOrNull("下周三", NOW_SUNDAY), expected: "2026年11月4日" },
  { name: "今天周日，下周一 = 11月2日", actual: () => resolveOrNull("下周一", NOW_SUNDAY), expected: "2026年11月2日" },
  { name: "今天周日，下周日 = 11月8日", actual: () => resolveOrNull("下周日", NOW_SUNDAY), expected: "2026年11月8日" },
  { name: "今天周日，下周天 = 11月8日", actual: () => resolveOrNull("下周天", NOW_SUNDAY), expected: "2026年11月8日" },
  { name: "今天周日，下一周周三 = 11月4日", actual: () => resolveOrNull("下一周周三", NOW_SUNDAY), expected: "2026年11月4日" },
  { name: "今天周一，下周三 = 11月11日", actual: () => resolveOrNull("下周三", NOW_MONDAY), expected: "2026年11月11日" },
  { name: "今天周三，下周三 = 11月11日", actual: () => resolveOrNull("下周三", NOW_WEDNESDAY), expected: "2026年11月11日" },
  { name: "今天周六，下周三 = 11月11日", actual: () => resolveOrNull("下周三", NOW_SATURDAY), expected: "2026年11月11日" },

  // --- 下下周X / 下下个X ---
  { name: "今天周日，下下周三 = 11月11日", actual: () => resolveOrNull("下下周三", NOW_SUNDAY), expected: "2026年11月11日" },
  { name: "今天周日，下下个星期三 = 11月11日", actual: () => resolveOrNull("下下个星期三", NOW_SUNDAY), expected: "2026年11月11日" },
  { name: "今天周一，下下周三 = 11月18日", actual: () => resolveOrNull("下下周三", NOW_MONDAY), expected: "2026年11月18日" },
  { name: "今天周日，下下周一 = 11月9日", actual: () => resolveOrNull("下下周一", NOW_SUNDAY), expected: "2026年11月9日" },

  // --- 月底/月初 ---
  { name: "本月底（2026-11-01）= 11月30日", actual: () => resolveOrNull("本月底", NOW_SUNDAY), expected: "2026年11月30日" },
  { name: "本月末（2026-11-01）= 11月30日", actual: () => resolveOrNull("本月末", NOW_SUNDAY), expected: "2026年11月30日" },
  { name: "本月初（2026-11-01）= 11月1日", actual: () => resolveOrNull("本月初", NOW_SUNDAY), expected: "2026年11月1日" },
  { name: "下月底（2026-11-01）= 12月31日", actual: () => resolveOrNull("下月底", NOW_SUNDAY), expected: "2026年12月31日" },
  { name: "下月初（2026-11-01）= 12月1日", actual: () => resolveOrNull("下月初", NOW_SUNDAY), expected: "2026年12月1日" },
  { name: "下月底（2026-01-31）= 2月28日（平年）", actual: () => resolveOrNull("下月底", NOW_JAN31), expected: "2026年2月28日" },
  { name: "本月底（2024-02-01 闰年）= 2月29日", actual: () => resolveOrNull("本月底", NOW_FEB01), expected: "2024年2月29日" },
  { name: "本月底（2026-02-28 平年）= 2月28日", actual: () => resolveOrNull("本月底", NOW_FEB28), expected: "2026年2月28日" },

  // --- 本月X日 / 下月X日 ---
  { name: "本月25日（2026-11-01）= 11月25日", actual: () => resolveOrNull("本月25日", NOW_SUNDAY), expected: "2026年11月25日" },
  { name: "下月25日（2026-11-01）= 12月25日", actual: () => resolveOrNull("下月25日", NOW_SUNDAY), expected: "2026年12月25日" },
  { name: "本月25日（2026-11-26 已过）= null", actual: () => resolveOrNull("本月25日", d(2026, 11, 26)), expected: null },
  { name: "下月31日（2026-11-01，12月有31日）= 12月31日", actual: () => resolveOrNull("下月31日", NOW_SUNDAY), expected: "2026年12月31日" },
  { name: "下月31日（2026-01-01，2月没有31日）= null", actual: () => resolveOrNull("下月31日", d(2026, 1, 1)), expected: null },

  // --- X天内 / X天后 ---
  { name: "三天内（2026-11-01）= 11月4日", actual: () => resolveOrNull("三天内", NOW_SUNDAY), expected: "2026年11月4日" },
  { name: "三天后（2026-11-01）= 11月4日", actual: () => resolveOrNull("三天后", NOW_SUNDAY), expected: "2026年11月4日" },
  { name: "一天后（2026-11-01）= 11月2日", actual: () => resolveOrNull("一天后", NOW_SUNDAY), expected: "2026年11月2日" },
  { name: "两天后（2026-11-01）= 11月3日", actual: () => resolveOrNull("两天后", NOW_SUNDAY), expected: "2026年11月3日" },
  { name: "十天内（2026-11-01）= 11月11日", actual: () => resolveOrNull("十天内", NOW_SUNDAY), expected: "2026年11月11日" },
  { name: "十五天后（2026-11-01）= 11月16日", actual: () => resolveOrNull("十五天后", NOW_SUNDAY), expected: "2026年11月16日" },
  { name: "二十天内（2026-11-01）= 11月21日", actual: () => resolveOrNull("二十天内", NOW_SUNDAY), expected: "2026年11月21日" },
  { name: "7天内 = 11月8日", actual: () => resolveOrNull("7天内", NOW_SUNDAY), expected: "2026年11月8日" },
  { name: "3天后 = 11月4日", actual: () => resolveOrNull("3天后", NOW_SUNDAY), expected: "2026年11月4日" },
  { name: "三日之内 = 11月4日", actual: () => resolveOrNull("三日之内", NOW_SUNDAY), expected: "2026年11月4日" },
  { name: "三天以后 = 11月4日", actual: () => resolveOrNull("三天以后", NOW_SUNDAY), expected: "2026年11月4日" },

  // --- 过X天 ---
  { name: "过三天（2026-11-01）= 11月4日", actual: () => resolveOrNull("过三天", NOW_SUNDAY), expected: "2026年11月4日" },
  { name: "过一天（2026-11-01）= 11月2日", actual: () => resolveOrNull("过一天", NOW_SUNDAY), expected: "2026年11月2日" },
  { name: "过两天（2026-11-01）= 11月3日", actual: () => resolveOrNull("过两天", NOW_SUNDAY), expected: "2026年11月3日" },
  { name: "过十天（2026-11-01）= 11月11日", actual: () => resolveOrNull("过十天", NOW_SUNDAY), expected: "2026年11月11日" },
  { name: "过二十天（2026-11-01）= 11月21日", actual: () => resolveOrNull("过二十天", NOW_SUNDAY), expected: "2026年11月21日" },
  { name: "过7天（阿拉伯数字）= 11月8日", actual: () => resolveOrNull("过7天", NOW_SUNDAY), expected: "2026年11月8日" },

  // --- 过X周 / 过X个星期 ---
  { name: "过一周（2026-11-01）= 11月8日", actual: () => resolveOrNull("过一周", NOW_SUNDAY), expected: "2026年11月8日" },
  { name: "过两周（2026-11-01）= 11月15日", actual: () => resolveOrNull("过两周", NOW_SUNDAY), expected: "2026年11月15日" },
  { name: "过三周（2026-11-01）= 11月22日", actual: () => resolveOrNull("过三周", NOW_SUNDAY), expected: "2026年11月22日" },
  { name: "过一个星期（2026-11-01）= 11月8日", actual: () => resolveOrNull("过一个星期", NOW_SUNDAY), expected: "2026年11月8日" },
  { name: "过两个星期（2026-11-01）= 11月15日", actual: () => resolveOrNull("过两个星期", NOW_SUNDAY), expected: "2026年11月15日" },
  { name: "过2周（阿拉伯数字）= 11月15日", actual: () => resolveOrNull("过2周", NOW_SUNDAY), expected: "2026年11月15日" },

  // --- X周内 / X周后 ---
  { name: "一周内（2026-11-01）= 11月8日", actual: () => resolveOrNull("一周内", NOW_SUNDAY), expected: "2026年11月8日" },
  { name: "一周后（2026-11-01）= 11月8日", actual: () => resolveOrNull("一周后", NOW_SUNDAY), expected: "2026年11月8日" },
  { name: "两周后（2026-11-01）= 11月15日", actual: () => resolveOrNull("两周后", NOW_SUNDAY), expected: "2026年11月15日" },
  { name: "三周内（2026-11-01）= 11月22日", actual: () => resolveOrNull("三周内", NOW_SUNDAY), expected: "2026年11月22日" },
  { name: "一个星期后（2026-11-01）= 11月8日", actual: () => resolveOrNull("一个星期后", NOW_SUNDAY), expected: "2026年11月8日" },
  { name: "两个星期内（2026-11-01）= 11月15日", actual: () => resolveOrNull("两个星期内", NOW_SUNDAY), expected: "2026年11月15日" },

  // --- X个月内 / X个月后 ---
  { name: "一个月内（2026-11-01）= 12月1日", actual: () => resolveOrNull("一个月内", NOW_SUNDAY), expected: "2026年12月1日" },
  { name: "一个月后（2026-11-01）= 12月1日", actual: () => resolveOrNull("一个月后", NOW_SUNDAY), expected: "2026年12月1日" },
  { name: "三个月后（2026-11-01）= 2027年2月1日", actual: () => resolveOrNull("三个月后", NOW_SUNDAY), expected: "2027年2月1日" },
  { name: "六个月后（2026-11-01）= 2027年5月1日", actual: () => resolveOrNull("六个月后", NOW_SUNDAY), expected: "2027年5月1日" },
  { name: "十二个月内（2026-11-01）= 2027年11月1日", actual: () => resolveOrNull("十二个月内", NOW_SUNDAY), expected: "2027年11月1日" },
  { name: "过一个月（2026-11-01）= 12月1日", actual: () => resolveOrNull("过一个月", NOW_SUNDAY), expected: "2026年12月1日" },
  { name: "过三个月（2026-11-01）= 2027年2月1日", actual: () => resolveOrNull("过三个月", NOW_SUNDAY), expected: "2027年2月1日" },

  // --- 月份月末处理 ---
  { name: "月末：2026-01-31 一个月后 = 2月28日", actual: () => resolveOrNull("一个月后", NOW_JAN31), expected: "2026年2月28日" },
  { name: "月末闰年：2024-01-31 一个月后 = 2月29日", actual: () => resolveOrNull("一个月后", d(2024, 1, 31)), expected: "2024年2月29日" },
  { name: "月末：2026-03-31 一个月后 = 4月30日", actual: () => resolveOrNull("一个月后", NOW_MAR31), expected: "2026年4月30日" },
  { name: "月末：2026-01-15 一个月后 = 2月15日", actual: () => resolveOrNull("一个月后", NOW_JAN15), expected: "2026年2月15日" },

  // --- X年内 / X年后 / 过X年 ---
  { name: "一年后（2026-11-01）= 2027年11月1日", actual: () => resolveOrNull("一年后", NOW_SUNDAY), expected: "2027年11月1日" },
  { name: "两年后（2026-11-01）= 2028年11月1日", actual: () => resolveOrNull("两年后", NOW_SUNDAY), expected: "2028年11月1日" },
  { name: "一年内（2026-11-01）= 2027年11月1日", actual: () => resolveOrNull("一年内", NOW_SUNDAY), expected: "2027年11月1日" },
  { name: "过一年（2026-11-01）= 2027年11月1日", actual: () => resolveOrNull("过一年", NOW_SUNDAY), expected: "2027年11月1日" },
  { name: "过三年（2026-11-01）= 2029年11月1日", actual: () => resolveOrNull("过三年", NOW_SUNDAY), expected: "2029年11月1日" },
  { name: "闰年跨年：2024-02-29 一年后 = 2025年2月28日", actual: () => resolveOrNull("一年后", d(2024, 2, 29)), expected: "2025年2月28日" },

  // --- 跨月 ---
  { name: "跨月：2026-01-31 明天 = 2月1日", actual: () => resolveOrNull("明天", NOW_JAN31), expected: "2026年2月1日" },
  { name: "跨月：2026-01-31 三天内 = 2月3日", actual: () => resolveOrNull("三天内", NOW_JAN31), expected: "2026年2月3日" },
  { name: "跨月：2026-01-31 过三天 = 2月3日", actual: () => resolveOrNull("过三天", NOW_JAN31), expected: "2026年2月3日" },
  { name: "跨月：2026-01-31 下周三 = 2月4日", actual: () => resolveOrNull("下周三", NOW_JAN31), expected: "2026年2月4日" },
  { name: "跨月：2026-01-31 这个星期三已过 → 2月4日", actual: () => resolveOrNull("这个星期三", NOW_JAN31), expected: "2026年2月4日" },
  { name: "跨月：2026-01-31 一周后 = 2月7日", actual: () => resolveOrNull("一周后", NOW_JAN31), expected: "2026年2月7日" },
  { name: "跨月：2026-01-31 过一周 = 2月7日", actual: () => resolveOrNull("过一周", NOW_JAN31), expected: "2026年2月7日" },

  // --- 跨年 ---
  { name: "跨年：2025-12-31 明天 = 2026年1月1日", actual: () => resolveOrNull("明天", NOW_DEC31), expected: "2026年1月1日" },
  { name: "跨年：2025-12-31 三天后 = 2026年1月3日", actual: () => resolveOrNull("三天后", NOW_DEC31), expected: "2026年1月3日" },
  { name: "跨年：2025-12-31 过三天 = 2026年1月3日", actual: () => resolveOrNull("过三天", NOW_DEC31), expected: "2026年1月3日" },
  { name: "跨年：2025-12-31 一周后 = 2026年1月7日", actual: () => resolveOrNull("一周后", NOW_DEC31), expected: "2026年1月7日" },
  { name: "跨年：2025-12-31 过一周 = 2026年1月7日", actual: () => resolveOrNull("过一周", NOW_DEC31), expected: "2026年1月7日" },
  { name: "跨年：2025-12-31 一个月后 = 2026年1月31日", actual: () => resolveOrNull("一个月后", NOW_DEC31), expected: "2026年1月31日" },
  { name: "跨年：2025-12-31 三个月后 = 2026年3月31日", actual: () => resolveOrNull("三个月后", NOW_DEC31), expected: "2026年3月31日" },
  { name: "跨年：2025-11-15 三个月后 = 2026年2月15日", actual: () => resolveOrNull("三个月后", NOW_NOV15_2025), expected: "2026年2月15日" },

  // --- 闰年 vs 平年月底 ---
  { name: "闰年：2024-02-27 三天内 = 3月1日", actual: () => resolveOrNull("三天内", NOW_FEB27_LEAP), expected: "2024年3月1日" },
  { name: "平年：2026-02-27 三天内 = 3月2日", actual: () => resolveOrNull("三天内", NOW_FEB27_COMMON), expected: "2026年3月2日" },
  { name: "平年：2026-02-28 明天 = 3月1日", actual: () => resolveOrNull("明天", NOW_FEB28), expected: "2026年3月1日" },

  // --- 含糊说法返回 null ---
  { name: "「三月之后」= null", actual: () => resolveOrNull("三月之后", NOW_SUNDAY), expected: null },
  { name: "「一月后」= null", actual: () => resolveOrNull("一月后", NOW_SUNDAY), expected: null },
  { name: "「十二月内」= null", actual: () => resolveOrNull("十二月内", NOW_SUNDAY), expected: null },
  // 019g 起「半个月后」已本地化（15 天），不再是含糊说法，
  // 因此从「返回 null」改为正向断言。原期望 null 是 019 收官时记录已知边界用的，现已过时。
  { name: "「半个月后」= 2026年11月16日", actual: () => resolveOrNull("半个月后", NOW_SUNDAY), expected: "2026年11月16日" },
  { name: "「几天后」= null", actual: () => resolveOrNull("几天后", NOW_SUNDAY), expected: null },
  { name: "「数天内」= null", actual: () => resolveOrNull("数天内", NOW_SUNDAY), expected: null },
  { name: "「一百天后」= null", actual: () => resolveOrNull("一百天后", NOW_SUNDAY), expected: null },
  { name: "「一百个月内」= null", actual: () => resolveOrNull("一百个月内", NOW_SUNDAY), expected: null },
  { name: "「下周」单独 = null", actual: () => resolveOrNull("下周", NOW_SUNDAY), expected: null },
  { name: "「月底」没说哪个月 = null", actual: () => resolveOrNull("月底", NOW_SUNDAY), expected: null },
  { name: "「近期」= null", actual: () => resolveOrNull("近期", NOW_SUNDAY), expected: null },
  { name: "「一周」单独（无内/后）= null", actual: () => resolveOrNull("一周", NOW_SUNDAY), expected: null },
  { name: "「三天」单独（无内/后）= null", actual: () => resolveOrNull("三天", NOW_SUNDAY), expected: null },
  { name: "「一个月」单独（无内/后）= null", actual: () => resolveOrNull("一个月", NOW_SUNDAY), expected: null },
  { name: "「三年」单独（无内/后）= null", actual: () => resolveOrNull("三年", NOW_SUNDAY), expected: null },
  { name: "空字符串 = null", actual: () => resolveOrNull("", NOW_SUNDAY), expected: null },

  // --- extractNotice + resolveRelativeDate 组合 ---
  { name: "组合：原文「这个星期三前交」", actual: () => {
      const rule = extractNotice("请于这个星期三前将材料交至A101。");
      const r = resolveRelativeDate(rule.deadline, NOW_SUNDAY);
      return r ? r.normalized : null;
    }, expected: "2026年11月4日" },
  { name: "组合：原文「下个星期三前交」", actual: () => {
      const rule = extractNotice("请于下个星期三前将材料交至A101。");
      const r = resolveRelativeDate(rule.deadline, NOW_SUNDAY);
      return r ? r.normalized : null;
    }, expected: "2026年11月4日" },
  { name: "组合：原文「下下周三交」", actual: () => {
      const rule = extractNotice("请于下下周三前将材料交至A101。");
      const r = resolveRelativeDate(rule.deadline, NOW_SUNDAY);
      return r ? r.normalized : null;
    }, expected: "2026年11月11日" },
  { name: "组合：原文「过三天交」", actual: () => {
      const rule = extractNotice("请过三天把表交到教务处A101。");
      const r = resolveRelativeDate(rule.deadline, NOW_SUNDAY);
      return r ? r.normalized : null;
    }, expected: "2026年11月4日" },
  { name: "组合：原文「过一周报送」", actual: () => {
      const rule = extractNotice("材料请过一周报送至教务处A101。");
      const r = resolveRelativeDate(rule.deadline, NOW_SUNDAY);
      return r ? r.normalized : null;
    }, expected: "2026年11月8日" },
  { name: "组合：原文「一个月内提交」", actual: () => {
      const rule = extractNotice("请于一个月内提交材料至教务处A101。");
      const r = resolveRelativeDate(rule.deadline, NOW_SUNDAY);
      return r ? r.normalized : null;
    }, expected: "2026年12月1日" },
];

// ---------- 多金丝雀 ----------

/**
 * 【金丝雀设计原则】
 * 每个金丝雀都是“一个已知错误的实现”，跑在多个基准日下。
 * 要求：在**所有**基准日下，错误实现的输出都必须和正确实现不同。
 * 这样金丝雀本身才稳定——不会因为某天日历巧合让错误实现撞上正确答案。
 *
 * 【为什么不给每个金丝雀只挑一个基准日】
 * 上一轮教训：“这个星期三 = 下周三”这个错误实现在周四到周日抓不到，
 * 因为这几天本周三已过，正确实现顺延到下周，和“当成下周三”结果撞。
 * 多基准日能立刻发现这种“某天突然失灵”的情况。
 *
 * 【为什么不只用一个金丝雀】
 * 一个金丝雀只能覆盖它针对的那一块逻辑。周几有 weeksAhead 0/1/2 三档，
 * 自然月有 monthOffset 0/1 两档，用单一金丝雀覆盖不过来。
 * 用 4 个金丝雀分别盯着：自然月、本周系列、下周系列、下下周系列。
 */
const CANARIES = [
  {
    name: "一个月后 ≠ 加 30 天（管 X 个月后）",
    baselines: [
      { label: "2026-01-15", date: NOW_JAN15 },
      { label: "2026-01-31", date: NOW_JAN31 },
      { label: "2026-02-28", date: NOW_FEB28 },
      { label: "2025-12-31", date: NOW_DEC31 },
    ],
    correct: (b) => resolveOrNull("一个月后", b),
    broken: (b) => {
      const x = new Date(b.getFullYear(), b.getMonth(), b.getDate() + 30);
      return fmt(x);
    },
  },
  {
    name: "这个星期三 ≠ 加 7 天（管 本周/这个/这周 系列）",
    baselines: [
      { label: "2026-11-01(周日)", date: NOW_SUNDAY },
      { label: "2026-11-02(周一)", date: NOW_MONDAY },
      { label: "2026-11-04(周三)", date: NOW_WEDNESDAY },
      { label: "2026-11-07(周六)", date: NOW_SATURDAY },
    ],
    correct: (b) => resolveOrNull("这个星期三", b),
    broken: (b) => {
      const x = new Date(b.getFullYear(), b.getMonth(), b.getDate() + 7);
      return fmt(x);
    },
  },
  {
    name: "下个星期三 ≠ 下下周三（管 下周/下个/下一个 系列，多算一周）",
    baselines: [
      { label: "2026-11-01(周日)", date: NOW_SUNDAY },
      { label: "2026-11-02(周一)", date: NOW_MONDAY },
      { label: "2026-11-04(周三)", date: NOW_WEDNESDAY },
      { label: "2026-11-07(周六)", date: NOW_SATURDAY },
    ],
    correct: (b) => resolveOrNull("下个星期三", b),
    broken: (b) => {
      const mondayBased = (b.getDay() + 6) % 7;
      const targetMondayBased = (3 + 6) % 7;
      const offset = 14 - mondayBased + targetMondayBased;
      const x = new Date(b.getFullYear(), b.getMonth(), b.getDate() + offset);
      return fmt(x);
    },
  },
  {
    name: "下下周三 ≠ 下周三（管 下下周/下下个 系列，少算一周）",
    baselines: [
      { label: "2026-11-01(周日)", date: NOW_SUNDAY },
      { label: "2026-11-02(周一)", date: NOW_MONDAY },
      { label: "2026-11-04(周三)", date: NOW_WEDNESDAY },
      { label: "2026-11-07(周六)", date: NOW_SATURDAY },
    ],
    correct: (b) => resolveOrNull("下下周三", b),
    broken: (b) => {
      const mondayBased = (b.getDay() + 6) % 7;
      const targetMondayBased = (3 + 6) % 7;
      const offset = 7 - mondayBased + targetMondayBased;
      const x = new Date(b.getFullYear(), b.getMonth(), b.getDate() + offset);
      return fmt(x);
    },
  },
];

function runCanaries() {
  console.log("");
  console.log("========== 金丝雀自检 ==========");
  console.log("每个金丝雀用多个基准日验证，所有基准日都必须抓到错误才算通过。");
  console.log("任何一个基准日抓不到，或金丝雀整体异常 PASS，都视为断言失效。");
  console.log("");

  let allPassed = true;

  for (const canary of CANARIES) {
    console.log("[金丝雀] " + canary.name);
    let captured = 0;
    let missed = 0;

    for (const baseline of canary.baselines) {
      const c = canary.correct(baseline.date);
      const b = canary.broken(baseline.date);
      if (eq(b, c)) {
        console.log(
          "    ✗ 基准 " +
            baseline.label +
            "：坏实现 " +
            JSON.stringify(b) +
            " 与正确 " +
            JSON.stringify(c) +
            " 相同 → 抓不到"
        );
        missed++;
      } else {
        console.log(
          "    ✓ 基准 " +
            baseline.label +
            "：坏实现 " +
            JSON.stringify(b) +
            " ≠ 正确 " +
            JSON.stringify(c) +
            " → 抓到"
        );
        captured++;
      }
    }

    if (missed > 0) {
      console.log(
        "    结论：抓不到 " +
          missed +
          " 个 / 抓到 " +
          captured +
          " 个 → 金丝雀不够硬，需重新挑错误实现"
      );
      allPassed = false;
    } else {
      console.log("    结论：全部 " + captured + " 个基准日都抓到 → 通过");
    }
    console.log("");
  }

  if (allPassed) {
    console.log(
      "金丝雀总结论：按预期 FAIL（所有金丝雀在所有基准日都能抓到错误，断言逻辑正常）"
    );
    return true;
  }
  console.log(
    "金丝雀总结论：异常 PASS（有金丝雀抓不到错误，断言逻辑可能已坏）"
  );
  return false;
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

const canaryOk = runCanaries();

console.log(
  "业务结果：" + pass + " 通过 / " + fail + " 失败 / 共 " + CASES.length + " 条"
);
console.log(
  "金丝雀结果：" +
    (canaryOk
      ? "按预期 FAIL（断言逻辑正常）"
      : "异常 PASS（断言逻辑已坏）")
);

if (fail > 0 || !canaryOk) {
  process.exitCode = 1;
}