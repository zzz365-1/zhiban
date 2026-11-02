/**
 * 示例通知 自检
 * 用法：node scripts/test-sample-notices.mjs
 *
 * 引用页面真实模块：
 *   ../app/lib/sampleNotices.js
 *   ../app/lib/todo.js      （formatRemaining / getTodoItems）
 *
 * 覆盖：
 *   - 返回 6 条，getSampleCount() 与实际条数一致
 *   - 原来 5 条 id 不变
 *   - 第 6 条 deadlineDate = 5 天后 14:00
 *   - 第 6 条 formatRemaining 在 NOW_A / NOW_B / NOW_C 下都是 amber
 *   - 第 6 条不在待办里（5 天 > 3 天）
 *   - 第 2 条仍在待办里（3 天）
 *   - 第 6 条有地点、有材料
 *   - 换 now 后第 6 条跟着变
 *   - 金丝雀：写死第 6 条日期为固定日期，在 NOW_B 下断言必须拒绝
 */

import {
  buildSampleNotices,
  getSampleCount,
} from "../app/lib/sampleNotices.js";
import { formatRemaining, getTodoItems } from "../app/lib/todo.js";

function eq(a, b) {
  return a === b;
}

function addDays(base, n) {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

function atTime(date, hh, mm) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hh,
    mm,
    0,
    0
  ).getTime();
}

const NOW_A = new Date(2026, 10, 1, 10, 0, 0).getTime();  // 2026-11-01 周日 10:00
const NOW_B = new Date(2026, 11, 15, 10, 0, 0).getTime(); // 2026-12-15 周二 10:00
const NOW_C = new Date(2027, 0, 10, 22, 30, 0).getTime(); // 2027-01-10 周日 22:30

const CASES = [
  // --- 条数 ---
  {
    name: "返回 6 条",
    actual: () => buildSampleNotices(NOW_A).length,
    expected: 6,
  },
  {
    name: "getSampleCount() = 6",
    actual: () => getSampleCount(),
    expected: 6,
  },
  {
    name: "getSampleCount() 与实际条数一致（不写死）",
    actual: () => getSampleCount() === buildSampleNotices(NOW_A).length,
    expected: true,
  },
  {
    name: "id 不重复",
    actual: () => {
      const ids = buildSampleNotices(NOW_A).map((n) => n.id);
      return new Set(ids).size === ids.length;
    },
    expected: true,
  },

  // --- 原来 5 条不变 ---
  {
    name: "前 5 条 id 依次是 sample_1..sample_5",
    actual: () =>
      buildSampleNotices(NOW_A)
        .slice(0, 5)
        .map((n) => n.id)
        .join(","),
    expected: "sample_1,sample_2,sample_3,sample_4,sample_5",
  },
  {
    name: "第 2 条 deadlineDate 仍是 3 天后 15:00",
    actual: () => buildSampleNotices(NOW_A)[1].deadlineDate,
    expected: atTime(addDays(NOW_A, 3), 15, 0),
  },

  // --- 第 6 条日期 ---
  {
    name: "第 6 条 deadlineDate = 5 天后 14:00（NOW_A）",
    actual: () => buildSampleNotices(NOW_A)[5].deadlineDate,
    expected: atTime(addDays(NOW_A, 5), 14, 0),
  },
  {
    name: "第 6 条 deadlineDate = 5 天后 14:00（NOW_B）",
    actual: () => buildSampleNotices(NOW_B)[5].deadlineDate,
    expected: atTime(addDays(NOW_B, 5), 14, 0),
  },
  {
    name: "第 6 条 deadlineDate = 5 天后 14:00（NOW_C，晚间时刻）",
    actual: () => buildSampleNotices(NOW_C)[5].deadlineDate,
    expected: atTime(addDays(NOW_C, 5), 14, 0),
  },

  // --- 第 6 条紧急度是 amber（黄） ---
  {
    name: "第 6 条 formatRemaining 的 level = amber（NOW_A）",
    actual: () =>
      formatRemaining(buildSampleNotices(NOW_A)[5].deadlineDate, NOW_A).level,
    expected: "amber",
  },
  {
    name: "第 6 条 formatRemaining 的 level = amber（NOW_B）",
    actual: () =>
      formatRemaining(buildSampleNotices(NOW_B)[5].deadlineDate, NOW_B).level,
    expected: "amber",
  },
  {
    name: "第 6 条 formatRemaining 的 level = amber（NOW_C，晚间时刻）",
    actual: () =>
      formatRemaining(buildSampleNotices(NOW_C)[5].deadlineDate, NOW_C).level,
    expected: "amber",
  },
  {
    name: "第 6 条剩余天数 = 5（NOW_A）",
    actual: () =>
      formatRemaining(buildSampleNotices(NOW_A)[5].deadlineDate, NOW_A).text,
    expected: "剩 5 天",
  },

  // --- 第 6 条不在待办里，第 2 条仍在 ---
  {
    name: "第 6 条不出现在待办里（5 天 > 3 天）",
    actual: () =>
      getTodoItems(buildSampleNotices(NOW_A), NOW_A).some(
        (n) => n.id === "sample_6"
      ),
    expected: false,
  },
  {
    name: "第 2 条仍出现在待办里（3 天）",
    actual: () =>
      getTodoItems(buildSampleNotices(NOW_A), NOW_A).some(
        (n) => n.id === "sample_2"
      ),
    expected: true,
  },
  {
    name: "待办里一共 2 条（第 1、2 条）",
    actual: () => getTodoItems(buildSampleNotices(NOW_A), NOW_A).length,
    expected: 2,
  },

  // --- 第 6 条有内容 ---
  {
    name: "035 第 1 条示例带活动日期（双日期那条不能只有截止）",
    actual: () => {
      const a = buildSampleNotices(NOW_A)[0].analysis;
      if (!a.eventDate) return "FAIL: 没有 eventDate";
      if (a.eventDate === a.deadline) return "FAIL: 活动日期和截止同一天";
      return true;
    },
    expected: true,
  },
  {
    name: "035 第 1 条示例的活动日期是截止日的后一天（防误杀）",
    actual: () => {
      const a = buildSampleNotices(NOW_A)[0].analysis;
      if (!a.eventDate) return "FAIL: 没有 eventDate";
      // 自己算一遍两天后，不写死字符串，免得哪天改了基准日期用例就假绿。
      const d = new Date(new Date(NOW_A).getTime() + 2 * 86400000);
      const expect =
        d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日";
      if (a.eventDate !== expect)
        return "FAIL: 期望 " + expect + " 实际 " + a.eventDate;
      return true;
    },
    expected: true,
  },
  {
    name: "第 6 条有地点",
    actual: () => Boolean(buildSampleNotices(NOW_A)[5].analysis.location),
    expected: true,
  },
  {
    name: "第 6 条有材料（至少 2 样）",
    actual: () =>
      buildSampleNotices(NOW_A)[5].analysis.materials.length >= 2,
    expected: true,
  },
  {
    name: "第 6 条原文含“期中教学检查”",
    actual: () =>
      buildSampleNotices(NOW_A)[5].text.includes("期中教学检查"),
    expected: true,
  },

  // --- 换 now 后第 6 条跟着变 ---
  {
    name: "换 now 后第 6 条 deadlineDate 跟着变",
    actual: () => {
      const a = buildSampleNotices(NOW_A)[5].deadlineDate;
      const b = buildSampleNotices(NOW_B)[5].deadlineDate;
      const c = buildSampleNotices(NOW_C)[5].deadlineDate;
      return a !== b && b !== c && a !== c;
    },
    expected: true,
  },
];

// ---------- 金丝雀 ----------

/**
 * 坏实现：把第 6 条日期写死为 2026-11-06 14:00。
 * 在 NOW_B（2026-12-15）下跑，deadlineDate 完全不对。
 * 如果断言把这个写死值当成 NOW_B 下的正确值，说明断言坏了。
 */
function brokenSixthForNowB() {
  return {
    id: "sample_6",
    deadlineDate: new Date(2026, 10, 6, 14, 0, 0).getTime(),
  };
}

function runCanary() {
  const broken = brokenSixthForNowB();
  const expectedForNowB = atTime(addDays(NOW_B, 5), 14, 0);
  const brokenValue = broken.deadlineDate;

  console.log("[金丝雀] 用写死第 6 条日期的坏实现，断言必须拒绝");
  console.log("    坏实现第 6 条 deadlineDate = " + brokenValue);
  console.log("    在 NOW_B 下的正确值应为 " + expectedForNowB);
  console.log(
    "    在 NOW_B 下的真实实现值 = " + buildSampleNotices(NOW_B)[5].deadlineDate
  );

  const wouldPass = eq(brokenValue, expectedForNowB);
  if (wouldPass) {
    console.log("    BROKEN - 写死值被错误判为与 NOW_B 正确值相等");
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