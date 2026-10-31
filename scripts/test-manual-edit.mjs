/**
 * 手动修改自检
 * 用法：node scripts/test-manual-edit.mjs
 *
 * 直接引用页面真实模块：
 *   ../app/lib/noticeOps.js  （修改一条通知）
 *   ../app/lib/deadline.js   （日期解析、剩余天数）
 *   ../app/lib/todo.js       （待办筛选）
 *   ../app/lib/calendar.js   （日历日期 key）
 *
 * 验证：
 *   - 五种日期写法能识别，非法日期被拒绝
 *   - 修改后剩余天数、日历格子、待办清单三处同步
 *   - analysis._source 与 notice.source 同时变为手动修正（左右两侧一致）
 *   - 标题同步、材料正确保存
 *   - 金丝雀：故意用一个不重算 deadlineDate 的坏函数，断言必须 FAIL
 */

import { updateNoticeAnalysis } from "../app/lib/noticeOps.js";
import { parseUserDateInput, getRemainingDays } from "../app/lib/deadline.js";
import { getTodoItems } from "../app/lib/todo.js";
import { formatDateKey } from "../app/lib/calendar.js";

const NOW = new Date(2026, 9, 31, 10, 0, 0).getTime(); // 2026-10-31 10:00
const BASE = new Date(2026, 9, 31);

function eq(a, b) {
  return a === b;
}

const BASE_NOTICE = {
  id: "n1",
  title: "原始标题",
  source: "AI 辅助",
  analysis: {
    deadline: "2026年11月5日",
    time: "17:00",
    location: "A101",
    materials: [],
    audience: null,
    _source: "mixed",
  },
  deadlineDate: new Date(2026, 10, 5, 17, 0).getTime(),
};

const CASES = [
  // --- 日期写法识别 ---
  {
    name: '日期写法 "11月6日"',
    actual: () => {
      const r = parseUserDateInput("11月6日", BASE);
      return r ? r.normalized : null;
    },
    expected: "2026年11月6日",
  },
  {
    name: '日期写法 "2026-11-06"',
    actual: () => {
      const r = parseUserDateInput("2026-11-06", BASE);
      return r ? r.normalized : null;
    },
    expected: "2026年11月6日",
  },
  {
    name: '日期写法 "11/6"',
    actual: () => {
      const r = parseUserDateInput("11/6", BASE);
      return r ? r.normalized : null;
    },
    expected: "2026年11月6日",
  },
  {
    name: '日期写法 "2026/11/6"',
    actual: () => {
      const r = parseUserDateInput("2026/11/6", BASE);
      return r ? r.normalized : null;
    },
    expected: "2026年11月6日",
  },
  {
    name: '日期写法 "2026年11月6日"',
    actual: () => {
      const r = parseUserDateInput("2026年11月6日", BASE);
      return r ? r.normalized : null;
    },
    expected: "2026年11月6日",
  },
  {
    name: '非法日期 "13月45日" 应拒绝',
    actual: () => parseUserDateInput("13月45日", BASE),
    expected: null,
  },
  {
    name: '非法日期 "2026-13-45" 应拒绝',
    actual: () => parseUserDateInput("2026-13-45", BASE),
    expected: null,
  },
  {
    name: '非法日期 "abc" 应拒绝',
    actual: () => parseUserDateInput("abc", BASE),
    expected: null,
  },

  // --- 修改后三处同步 ---
  {
    name: "修改后剩余天数同步（左侧列表用）",
    actual: () => {
      const u = updateNoticeAnalysis(BASE_NOTICE, {
        deadline: "2026年11月1日",
        time: "10:00",
      });
      return getRemainingDays(u.deadlineDate, new Date(NOW));
    },
    expected: 1,
  },
  {
    name: "修改后日历格子同步（按日期分组用）",
    actual: () => {
      const u = updateNoticeAnalysis(BASE_NOTICE, {
        deadline: "2026年11月1日",
        time: "10:00",
      });
      return formatDateKey(new Date(u.deadlineDate));
    },
    expected: "2026-11-1",
  },
  {
    name: "修改后待办清单同步（三天内出现）",
    actual: () => {
      const u = updateNoticeAnalysis(BASE_NOTICE, {
        deadline: "2026年11月1日",
        time: "10:00",
      });
      return getTodoItems([u], NOW).length;
    },
    expected: 1,
  },

  // --- 来源标记：右侧（analysis._source）与左侧（notice.source）必须一致 ---
  {
    name: "修改后 analysis._source 为 manual（右侧标签用）",
    actual: () => {
      const u = updateNoticeAnalysis(BASE_NOTICE, { location: "B202" });
      return u.analysis._source;
    },
    expected: "manual",
  },
  {
    name: "修改后 notice.source 为「手动修正」（左侧列表用）",
    actual: () => {
      const u = updateNoticeAnalysis(BASE_NOTICE, { location: "B202" });
      return u.source;
    },
    expected: "手动修正",
  },

  // --- 标题、材料 ---
  {
    name: "修改标题后 notice.title 同步",
    actual: () => {
      const u = updateNoticeAnalysis(BASE_NOTICE, { title: "新标题" });
      return u.title;
    },
    expected: "新标题",
  },
  {
    name: "修改材料后为数组",
    actual: () => {
      const u = updateNoticeAnalysis(BASE_NOTICE, {
        materials: ["申请表", "身份证"],
      });
      return u.analysis.materials.join(",");
    },
    expected: "申请表,身份证",
  },
];

// ---------- 金丝雀 ----------

/**
 * 故意写一个“不重算 deadlineDate”的坏更新函数。
 * 真实函数会更新到 11月1日（剩 1 天），坏函数保持 11月5日（剩 5 天）。
 * 如果断言把 5 当成 1 判 PASS，说明断言逻辑坏了。
 */
function brokenUpdate(notice, patch) {
  return {
    ...notice,
    analysis: { ...notice.analysis, ...patch, _source: "manual" },
  };
}

function runCanary() {
  const broken = brokenUpdate(BASE_NOTICE, {
    deadline: "2026年11月1日",
    time: "10:00",
  });
  const brokenDays = getRemainingDays(broken.deadlineDate, new Date(NOW));

  console.log("[金丝雀] 用不重算 deadlineDate 的坏函数，断言必须 FAIL");
  const wouldPass = eq(brokenDays, 1);

  if (wouldPass) {
    console.log("    BROKEN - 坏函数剩余天数被错误判为 1");
    console.log("    结论：异常 PASS - 断言逻辑已坏！");
    return false;
  }

  console.log("    坏函数剩余天数 = " + brokenDays + "（正确应为 5）");
  console.log("    拒绝判为 1（正确）");
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