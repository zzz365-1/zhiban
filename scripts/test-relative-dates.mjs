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
 *   - 下周一 ~ 下周日（含“下周天”），从不同 today 出发
 *   - 本周X / 这周X（已过则顺延）
 *   - 本月底/本月初/下月底/下月初
 *   - 本月X日 / 下月X日
 *   - 跨月（1月31日 → 2月1日）、跨年（12月31日 → 1月1日）
 *   - 闰年（2024-02 有 29 天）
 *   - 星期日算「下周三」不会跳一周
 *   - 算不出来返回 null，不猜
 *   - extractNotice + resolveRelativeDate 组合
 *   - 金丝雀：把周日当一周第一天的坏实现，断言必须拒绝
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

// 基准日期
const NOW_SUNDAY = d(2026, 11, 1);     // 2026-11-01 周日
const NOW_MONDAY = d(2026, 11, 2);     // 2026-11-02 周一
const NOW_WEDNESDAY = d(2026, 11, 4);  // 2026-11-04 周三
const NOW_SATURDAY = d(2026, 11, 7);   // 2026-11-07 周六
const NOW_JAN31 = d(2026, 1, 31);      // 2026-01-31 周六
const NOW_DEC31 = d(2025, 12, 31);     // 2025-12-31 周三
const NOW_FEB01 = d(2024, 2, 1);       // 2024-02-01 周四（闰年）
const NOW_FEB28 = d(2026, 2, 28);      // 2026-02-28 周六（平年）

const CASES = [
  // --- 今天/明天/后天/大后天 ---
  {
    name: "今天（2026-11-01）",
    actual: () => resolveOrNull("今天", NOW_SUNDAY),
    expected: "2026年11月1日",
  },
  {
    name: "明天（2026-11-01）",
    actual: () => resolveOrNull("明天", NOW_SUNDAY),
    expected: "2026年11月2日",
  },
  {
    name: "后天（2026-11-01）",
    actual: () => resolveOrNull("后天", NOW_SUNDAY),
    expected: "2026年11月3日",
  },
  {
    name: "大后天（2026-11-01）",
    actual: () => resolveOrNull("大后天", NOW_SUNDAY),
    expected: "2026年11月4日",
  },

  // --- 星期日算「下周三」不跳一周 ---
  {
    name: "今天周日（2026-11-01），下周三 = 11月4日（不是 11 月 11 日）",
    actual: () => resolveOrNull("下周三", NOW_SUNDAY),
    expected: "2026年11月4日",
  },
  {
    name: "今天周日（2026-11-01），下周一 = 11月2日",
    actual: () => resolveOrNull("下周一", NOW_SUNDAY),
    expected: "2026年11月2日",
  },
  {
    name: "今天周日（2026-11-01），下周日 = 11月8日",
    actual: () => resolveOrNull("下周日", NOW_SUNDAY),
    expected: "2026年11月8日",
  },
  {
    name: "今天周日（2026-11-01），下周天 = 11月8日",
    actual: () => resolveOrNull("下周天", NOW_SUNDAY),
    expected: "2026年11月8日",
  },

  // --- 从周一看下周 ---
  {
    name: "今天周一（2026-11-02），下周三 = 11月11日",
    actual: () => resolveOrNull("下周三", NOW_MONDAY),
    expected: "2026年11月11日",
  },
  {
    name: "今天周三（2026-11-04），下周三 = 11月11日",
    actual: () => resolveOrNull("下周三", NOW_WEDNESDAY),
    expected: "2026年11月11日",
  },
  {
    name: "今天周六（2026-11-07），下周三 = 11月11日",
    actual: () => resolveOrNull("下周三", NOW_SATURDAY),
    expected: "2026年11月11日",
  },

  // --- 本周X / 这周X ---
  {
    name: "今天周日（2026-11-01），本周日 = 今天 11月1日",
    actual: () => resolveOrNull("本周日", NOW_SUNDAY),
    expected: "2026年11月1日",
  },
  {
    name: "今天周日（2026-11-01），这周日 = 今天 11月1日",
    actual: () => resolveOrNull("这周日", NOW_SUNDAY),
    expected: "2026年11月1日",
  },
  {
    name: "今天周日（2026-11-01），本周三已过 → 顺延 11月4日",
    actual: () => resolveOrNull("本周三", NOW_SUNDAY),
    expected: "2026年11月4日",
  },
  {
    name: "今天周一（2026-11-02），本周三 = 11月4日",
    actual: () => resolveOrNull("本周三", NOW_MONDAY),
    expected: "2026年11月4日",
  },
  {
    name: "今天周三（2026-11-04），本周三 = 今天 11月4日",
    actual: () => resolveOrNull("本周三", NOW_WEDNESDAY),
    expected: "2026年11月4日",
  },

  // --- 本月底/月初 ---
  {
    name: "本月底（2026-11-01）= 11月30日",
    actual: () => resolveOrNull("本月底", NOW_SUNDAY),
    expected: "2026年11月30日",
  },
  {
    name: "本月末（2026-11-01）= 11月30日",
    actual: () => resolveOrNull("本月末", NOW_SUNDAY),
    expected: "2026年11月30日",
  },
  {
    name: "本月初（2026-11-01）= 11月1日",
    actual: () => resolveOrNull("本月初", NOW_SUNDAY),
    expected: "2026年11月1日",
  },
  {
    name: "下月底（2026-11-01）= 12月31日",
    actual: () => resolveOrNull("下月底", NOW_SUNDAY),
    expected: "2026年12月31日",
  },
  {
    name: "下月初（2026-11-01）= 12月1日",
    actual: () => resolveOrNull("下月初", NOW_SUNDAY),
    expected: "2026年12月1日",
  },
  {
    name: "本月底（2026-01-31）= 1月31日",
    actual: () => resolveOrNull("本月底", NOW_JAN31),
    expected: "2026年1月31日",
  },
  {
    name: "下月底（2026-01-31）= 2月28日（平年）",
    actual: () => resolveOrNull("下月底", NOW_JAN31),
    expected: "2026年2月28日",
  },
  {
    name: "本月底（2024-02-01 闰年）= 2月29日",
    actual: () => resolveOrNull("本月底", NOW_FEB01),
    expected: "2024年2月29日",
  },
  {
    name: "本月底（2026-02-28 平年）= 2月28日",
    actual: () => resolveOrNull("本月底", NOW_FEB28),
    expected: "2026年2月28日",
  },

  // --- 本月X日 / 下月X日 ---
  {
    name: "本月25日（2026-11-01，未过）= 11月25日",
    actual: () => resolveOrNull("本月25日", NOW_SUNDAY),
    expected: "2026年11月25日",
  },
  {
    name: "下月25日（2026-11-01）= 12月25日",
    actual: () => resolveOrNull("下月25日", NOW_SUNDAY),
    expected: "2026年12月25日",
  },
  {
    name: "本月25日（2026-11-25 已过）= null（不猜）",
    actual: () => resolveOrNull("本月25日", d(2026, 11, 26)),
    expected: null,
  },
  {
    name: "下月31日（2026-11-01，12月有31日）= 12月31日",
    actual: () => resolveOrNull("下月31日", NOW_SUNDAY),
    expected: "2026年12月31日",
  },
  {
    name: "下月31日（2026-01-01，2月没有31日）= null",
    actual: () => resolveOrNull("下月31日", d(2026, 1, 1)),
    expected: null,
  },

  // --- 跨月：1月31日 → 明天是2月1日 ---
  {
    name: "跨月：2026-01-31 的明天 = 2月1日",
    actual: () => resolveOrNull("明天", NOW_JAN31),
    expected: "2026年2月1日",
  },
  {
    name: "跨月：2026-01-31 的下周三 = 2月4日",
    actual: () => resolveOrNull("下周三", NOW_JAN31),
    expected: "2026年2月4日",
  },

  // --- 跨年：12月31日 → 明天是1月1日 ---
  {
    name: "跨年：2025-12-31 的明天 = 2026年1月1日",
    actual: () => resolveOrNull("明天", NOW_DEC31),
    expected: "2026年1月1日",
  },
  {
    name: "跨年：2025-12-31 的下周一 = 2026年1月5日",
    actual: () => resolveOrNull("下周一", NOW_DEC31),
    expected: "2026年1月5日",
  },
  {
    name: "跨年：2025-12-31 的下月底 = 2026年1月31日",
    actual: () => resolveOrNull("下月底", NOW_DEC31),
    expected: "2026年1月31日",
  },

  // --- 算不出来返回 null，不猜 ---
  {
    name: "「下周」单独 = null（不猜）",
    actual: () => resolveOrNull("下周", NOW_SUNDAY),
    expected: null,
  },
  {
    name: "「月底」没说哪个月 = null",
    actual: () => resolveOrNull("月底", NOW_SUNDAY),
    expected: null,
  },
  {
    name: "「近期」= null",
    actual: () => resolveOrNull("近期", NOW_SUNDAY),
    expected: null,
  },
  {
    name: "「过几天」= null",
    actual: () => resolveOrNull("过几天", NOW_SUNDAY),
    expected: null,
  },
  {
    name: "空字符串 = null",
    actual: () => resolveOrNull("", NOW_SUNDAY),
    expected: null,
  },

  // --- extractNotice + resolveRelativeDate 组合 ---
  {
    name: "组合：原文「下周三前交」本地抽出「下周三」并换算",
    actual: () => {
      const text = "请于下周三前将材料交至A101。";
      const rule = extractNotice(text);
      const resolved = resolveRelativeDate(rule.deadline, NOW_SUNDAY);
      return resolved ? resolved.normalized : null;
    },
    expected: "2026年11月4日",
  },
  {
    name: "组合：原文「明天中午12点前交」本地抽出「明天」并换算",
    actual: () => {
      const text = "请于明天中午12点前将材料交至A101。";
      const rule = extractNotice(text);
      const resolved = resolveRelativeDate(rule.deadline, NOW_SUNDAY);
      return resolved ? resolved.normalized : null;
    },
    expected: "2026年11月2日",
  },
  {
    name: "组合：原文「本月底前完成缴费」本地抽出「本月底」并换算",
    actual: () => {
      const text = "请于本月底前完成缴费。";
      const rule = extractNotice(text);
      const resolved = resolveRelativeDate(rule.deadline, NOW_SUNDAY);
      return resolved ? resolved.normalized : null;
    },
    expected: "2026年11月30日",
  },
];

// ---------- 金丝雀 ----------

/**
 * 坏实现：把星期日当作一周的第一天（错误）。
 * 对「今天周日（2026-11-01），下周三」会算成 11月11日，
 * 正确应为 11月4日。
 * 如果断言把这个错值当成正确，说明断言坏了。
 */
function brokenResolveNextWednesday(now) {
  const sundayBased = now.getDay(); // 0=周日
  const target = 3; // 周三
  let delta = target - sundayBased;
  if (delta <= 0) delta += 7;
  // 错误：只加了一周，没有正确理解“下周”
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + delta + 7);
  return (
    d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日"
  );
}

function runCanary() {
  const correct = resolveOrNull("下周三", NOW_SUNDAY);
  const expected = "2026年11月4日";
  const broken = brokenResolveNextWednesday(NOW_SUNDAY);

  console.log("[金丝雀] 用周日作为一周第一天的坏实现，断言必须拒绝");
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