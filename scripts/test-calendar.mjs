/**
 * 日历 + 待办自检
 * 用法：node scripts/test-calendar.mjs
 *
 * 直接引用页面真正在用的模块：
 *   ../app/lib/calendar.js
 *   ../app/lib/todo.js
 * 不另抄一份逻辑，避免脚本和线上行为不一致。
 *
 * 覆盖：
 *   - 闰年二月（2024=29、1900=28、2000=29）、平年二月（2026=28）
 *   - 每月天数不同（1月31、4月30、12月31）
 *   - 跨年十二月（2025-12 网格末尾落在 2026-1-x）
 *   - 一号正好是星期天（2026-11-01）
 *   - 待办三天线、不到一天按小时、过期排除、无截止日期排除、排序
 *   - 金丝雀：故意写错期望值，验证断言机制真的会报 FAIL
 */

import {
  getDaysInMonth,
  buildMonthGrid,
} from "../app/lib/calendar.js";
import {
  formatRemaining,
  getTodoItems,
} from "../app/lib/todo.js";
import { buildRouteEvents } from "../app/lib/routeEvents.js";

// ---------- 断言 ----------

function eq(actual, expected) {
  return actual === expected;
}

function dateStr(d) {
  return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
}

// 固定“现在” = 2026-10-31 10:00 本地时间，保证结果可复现
const NOW = new Date(2026, 9, 31, 10, 0, 0).getTime();

// ---------- 业务用例 ----------

const CASES = [
  // --- 月历天数 ---
  {
    name: "2024年2月（闰年）= 29",
    actual: () => getDaysInMonth(2024, 1),
    expected: 29,
  },
  {
    name: "2026年2月（平年）= 28",
    actual: () => getDaysInMonth(2026, 1),
    expected: 28,
  },
  {
    name: "1900年2月（世纪年非闰年）= 28",
    actual: () => getDaysInMonth(1900, 1),
    expected: 28,
  },
  {
    name: "2000年2月（400 倍数闰年）= 29",
    actual: () => getDaysInMonth(2000, 1),
    expected: 29,
  },
  {
    name: "2026年1月 = 31",
    actual: () => getDaysInMonth(2026, 0),
    expected: 31,
  },
  {
    name: "2026年4月 = 30",
    actual: () => getDaysInMonth(2026, 3),
    expected: 30,
  },
  {
    name: "2026年12月 = 31",
    actual: () => getDaysInMonth(2026, 11),
    expected: 31,
  },

  // --- 月历网格 ---
  {
    name: "2026年10月网格第一格 = 2026-9-27（上个月尾巴）",
    actual: () => dateStr(buildMonthGrid(2026, 9)[0].date),
    expected: "2026-9-27",
  },
  {
    name: "2026年10月网格第一格不在本月",
    actual: () => buildMonthGrid(2026, 9)[0].inMonth,
    expected: false,
  },
  {
    name: "2026年10月网格长度 = 35（5 行）",
    actual: () => buildMonthGrid(2026, 9).length,
    expected: 35,
  },
  {
    name: "2025年12月网格最后一格跨年 = 2026-1-3",
    actual: () => {
      const g = buildMonthGrid(2025, 11);
      return dateStr(g[g.length - 1].date);
    },
    expected: "2026-1-3",
  },
  {
    name: "2025年12月网格最后一格不在本月",
    actual: () => {
      const g = buildMonthGrid(2025, 11);
      return g[g.length - 1].inMonth;
    },
    expected: false,
  },
  {
    name: "2026年11月1号是周日，网格第一格 = 2026-11-1",
    actual: () => dateStr(buildMonthGrid(2026, 10)[0].date),
    expected: "2026-11-1",
  },
  {
    name: "2026年11月网格第一格在本月",
    actual: () => buildMonthGrid(2026, 10)[0].inMonth,
    expected: true,
  },

  // --- 待办时间换算 ---
  {
    name: "剩 5 小时",
    actual: () =>
      formatRemaining(new Date(2026, 9, 31, 15, 0, 0).getTime(), NOW).text,
    expected: "剩 5 小时",
  },
  {
    name: "剩 23 小时 50 分 → 剩 23 小时（不到一天最多 23）",
    actual: () =>
      formatRemaining(new Date(2026, 10, 1, 9, 50, 0).getTime(), NOW).text,
    expected: "剩 23 小时",
  },
  {
    name: "剩 30 分钟 → 不到 1 小时",
    actual: () =>
      formatRemaining(new Date(2026, 9, 31, 10, 30, 0).getTime(), NOW).text,
    expected: "不到 1 小时",
  },
  {
    name: "剩 25 小时 → 剩 1 天（自然日）",
    actual: () =>
      formatRemaining(new Date(2026, 10, 1, 11, 0, 0).getTime(), NOW).text,
    expected: "剩 1 天",
  },
  {
    name: "已过期",
    actual: () =>
      formatRemaining(new Date(2026, 9, 31, 9, 0, 0).getTime(), NOW).text,
    expected: "已过期",
  },

  // --- 待办筛选与排序 ---
  {
    name: "三天内包含",
    actual: () =>
      getTodoItems(buildRouteEvents(
        [
          {
            id: "a",
            deadlineDate: new Date(2026, 10, 2, 17, 0, 0).getTime(),
          },
        ]),
        NOW
      ).length,
    expected: 1,
  },
  {
    name: "四天后不包含",
    actual: () =>
      getTodoItems(buildRouteEvents(
        [
          {
            id: "a",
            deadlineDate: new Date(2026, 10, 4, 17, 0, 0).getTime(),
          },
        ]),
        NOW
      ).length,
    expected: 0,
  },
  {
    name: "已过期不包含",
    actual: () =>
      getTodoItems(buildRouteEvents(
        [
          {
            id: "a",
            deadlineDate: new Date(2026, 9, 30, 17, 0, 0).getTime(),
          },
        ]),
        NOW
      ).length,
    expected: 0,
  },
  {
    name: "无截止日期不包含",
    actual: () =>
      getTodoItems(buildRouteEvents([{ id: "a", deadlineDate: null }]), NOW).length,
    expected: 0,
  },
  {
    name: "排序：越急越前",
    actual: () =>
      getTodoItems(buildRouteEvents(
        [
          {
            id: "late",
            deadlineDate: new Date(2026, 10, 3, 17, 0, 0).getTime(),
          },
          {
            id: "soon",
            deadlineDate: new Date(2026, 10, 1, 10, 0, 0).getTime(),
          },
          {
            id: "mid",
            deadlineDate: new Date(2026, 10, 2, 12, 0, 0).getTime(),
          },
        ]),
        NOW
      )
        .map((n) => n.noticeId)
        .join(","),
    expected: "soon,mid,late",
  },
];

// ---------- 金丝雀 ----------

/**
 * 故意把错误的期望值喂给同一个 eq 函数，
 * 期望全部被拒绝（返回 false，即 FAIL）。
 * 如果任何一条意外通过，说明 eq 本身坏了，
 * 业务用例的 PASS 也就不可信。
 */
function runCanary() {
  const checks = [
    {
      desc: "2026年2月天数故意写成 29（真实 28）",
      actual: getDaysInMonth(2026, 1),
      wrongExpected: 29,
    },
    {
      desc: "2026年10月网格长度故意写成 42（真实 35）",
      actual: buildMonthGrid(2026, 9).length,
      wrongExpected: 42,
    },
    {
      desc: "23 小时 50 分故意期望“剩 24 小时”（真实“剩 23 小时”）",
      actual: formatRemaining(
        new Date(2026, 10, 1, 9, 50, 0).getTime(),
        NOW
      ).text,
      wrongExpected: "剩 24 小时",
    },
  ];

  console.log("[金丝雀] 故意用错误期望，期望全部被拒绝（FAIL）");
  let broken = false;

  for (const c of checks) {
    const passed = eq(c.actual, c.wrongExpected);
    if (passed) {
      console.log("    BROKEN - " + c.desc + " 被错误判为 PASS");
      broken = true;
    } else {
      console.log("    拒绝（正确）- " + c.desc);
    }
  }

  if (broken) {
    console.log("    结论：异常 PASS - 断言逻辑已坏！");
    return false;
  }
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