/**
 * 示例通知 自检
 * 用法：node scripts/test-sample-notices.mjs
 *
 * 引用页面真实模块：../app/lib/sampleNotices.js
 *
 * 覆盖：
 *   - 返回 5 条
 *   - 字段完整（id / title / text / analysis / deadlineDate）
 *   - 第 1 条 deadlineDate = 明天 17:00
 *   - 第 2 条 deadlineDate = 三天后 15:00
 *   - 第 3 条 deadlineDate = null（「下周三」，保留给手动改）
 *   - 第 4 条 deadlineDate = null（活动通知）
 *   - 第 5 条 deadlineDate = 两天前 17:00，且 < now
 *   - 第 1 条原文含两个日期，analysis.deadline 取靠前那个
 *   - 换一个 now，所有 deadlineDate 跟着变
 *   - 金丝雀：用写死日期的坏实现，断言必须拒绝
 */

import { buildSampleNotices, getSampleCount } from "../app/lib/sampleNotices.js";

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

const NOW_A = new Date(2026, 10, 1, 10, 0, 0).getTime(); // 2026-11-01 周日
const NOW_B = new Date(2026, 11, 15, 10, 0, 0).getTime(); // 2026-12-15 周二

const CASES = [
  {
    name: "返回 5 条",
    actual: () => buildSampleNotices(NOW_A).length,
    expected: 5,
  },
  {
    name: "getSampleCount() = 5",
    actual: () => getSampleCount(),
    expected: 5,
  },
  {
    name: "每条都有 id / title / text / analysis / deadlineDate",
    actual: () => {
      const list = buildSampleNotices(NOW_A);
      return list.every(
        (n) =>
          typeof n.id === "string" &&
          typeof n.title === "string" &&
          typeof n.text === "string" &&
          n.analysis &&
          typeof n.analysis === "object" &&
          "deadlineDate" in n
      );
    },
    expected: true,
  },
  {
    name: "id 不重复",
    actual: () => {
      const list = buildSampleNotices(NOW_A);
      const ids = list.map((n) => n.id);
      return new Set(ids).size === ids.length;
    },
    expected: true,
  },

  // --- 日期按 now 动态算 ---
  {
    name: "第 1 条 deadlineDate = 明天 17:00",
    actual: () =>
      buildSampleNotices(NOW_A)[0].deadlineDate,
    expected: atTime(addDays(NOW_A, 1), 17, 0),
  },
  {
    name: "第 2 条 deadlineDate = 三天后 15:00",
    actual: () => buildSampleNotices(NOW_A)[1].deadlineDate,
    expected: atTime(addDays(NOW_A, 3), 15, 0),
  },
  {
    name: "第 3 条 deadlineDate = null（「下周三」）",
    actual: () => buildSampleNotices(NOW_A)[2].deadlineDate,
    expected: null,
  },
  {
    name: "第 4 条 deadlineDate = null（活动通知）",
    actual: () => buildSampleNotices(NOW_A)[3].deadlineDate,
    expected: null,
  },
  {
    name: "第 5 条 deadlineDate = 两天前 17:00",
    actual: () => buildSampleNotices(NOW_A)[4].deadlineDate,
    expected: atTime(addDays(NOW_A, -2), 17, 0),
  },
  {
    name: "第 5 条已过期（deadlineDate < now）",
    actual: () => buildSampleNotices(NOW_A)[4].deadlineDate < NOW_A,
    expected: true,
  },

  // --- 换 now 后全部跟着变 ---
  {
    name: "换 now 后第 1 条跟着变",
    actual: () => {
      const a = buildSampleNotices(NOW_A)[0].deadlineDate;
      const b = buildSampleNotices(NOW_B)[0].deadlineDate;
      return a !== b;
    },
    expected: true,
  },
  {
    name: "换 now 后第 2 条跟着变",
    actual: () => {
      const a = buildSampleNotices(NOW_A)[1].deadlineDate;
      const b = buildSampleNotices(NOW_B)[1].deadlineDate;
      return a !== b;
    },
    expected: true,
  },
  {
    name: "换 now 后第 5 条跟着变",
    actual: () => {
      const a = buildSampleNotices(NOW_A)[4].deadlineDate;
      const b = buildSampleNotices(NOW_B)[4].deadlineDate;
      return a !== b;
    },
    expected: true,
  },

  // --- 第 1 条含两个日期，取靠前那个 ---
  {
    name: "第 1 条原文含两个日期",
    actual: () => {
      const n = buildSampleNotices(NOW_A)[0];
      const tomorrowCN = (() => {
        const d = addDays(NOW_A, 1);
        return d.getMonth() + 1 + "月" + d.getDate() + "日";
      })();
      const dayAfterCN = (() => {
        const d = addDays(NOW_A, 2);
        return d.getMonth() + 1 + "月" + d.getDate() + "日";
      })();
      return n.text.includes(tomorrowCN) && n.text.includes(dayAfterCN);
    },
    expected: true,
  },
  {
    name: "第 1 条 analysis.deadline 取的是靠前那个（明天）",
    actual: () => {
      const n = buildSampleNotices(NOW_A)[0];
      const tomorrow = addDays(NOW_A, 1);
      return (
        n.analysis.deadline ===
        tomorrow.getFullYear() +
          "年" +
          (tomorrow.getMonth() + 1) +
          "月" +
          tomorrow.getDate() +
          "日"
      );
    },
    expected: true,
  },

  // --- 第 3 条可演示手动修改 ---
  {
    name: "第 3 条 analysis.deadline 是「下周三」（保留原文，可手动改）",
    actual: () => buildSampleNotices(NOW_A)[2].analysis.deadline,
    expected: "下周三",
  },
  {
    name: "第 3 条有地点和材料（方便演示改完日期后查看效果）",
    actual: () => {
      const n = buildSampleNotices(NOW_A)[2];
      return Boolean(n.analysis.location) && n.analysis.materials.length > 0;
    },
    expected: true,
  },

  // --- 第 4 条是活动通知，有地点无材料 ---
  {
    name: "第 4 条有地点、无材料、无截止日期",
    actual: () => {
      const n = buildSampleNotices(NOW_A)[3];
      return (
        Boolean(n.analysis.location) &&
        n.analysis.materials.length === 0 &&
        n.analysis.deadline === null
      );
    },
    expected: true,
  },
];

// ---------- 金丝雀 ----------

/**
 * 坏实现：日期写死为 2026年11月2日。
 * 在 NOW_B（2026-12-15）下跑，deadlineDate 完全不对。
 * 如果断言把这个写成时间戳当成正确结果，说明断言坏了。
 */
function brokenSampleNotices() {
  return [
    {
      id: "sample_1",
      deadlineDate: new Date(2026, 10, 2, 17, 0, 0).getTime(),
    },
  ];
}

function runCanary() {
  const broken = brokenSampleNotices();
  const expectedForNowB = atTime(addDays(NOW_B, 1), 17, 0);
  const brokenForNowB = broken[0].deadlineDate;

  console.log("[金丝雀] 用日期写死的坏实现，断言必须拒绝");
  console.log("    坏实现第 1 条 deadlineDate = " + brokenForNowB);
  console.log("    在 NOW_B 下的正确值应为 " + expectedForNowB);
  console.log("    在 NOW_B 下的真实实现值 = " + buildSampleNotices(NOW_B)[0].deadlineDate);

  const wouldPass = eq(brokenForNowB, expectedForNowB);
  if (wouldPass) {
    console.log("    BROKEN - 坏实现被错误判为与 NOW_B 正确值相等");
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