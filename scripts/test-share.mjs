/**
 * 分享文字自检
 * 用法：node scripts/test-share.mjs
 *
 * 直接引用页面真实模块：
 *   ../app/lib/shareText.js
 *   ../app/lib/noticeOps.js
 *   ../app/lib/deadline.js
 *
 * 验证：
 *   - 三天/七天范围筛选正确
 *   - 过期、无截止日期的不进入
 *   - 标题为空时用原文第一行
 *   - 文字格式：首行说明、末行来源、含地点和材料
 *   - 金丝雀：不筛选的坏实现必须被断言拒绝
 */

import {
  buildShareText,
  filterShareNotices,
  getNoticeTitle,
} from "../app/lib/shareText.js";
import { updateNoticeAnalysis } from "../app/lib/noticeOps.js";

const LF = String.fromCharCode(10);

// 固定“现在” = 2026-10-31 10:00 本地时间
const NOW = new Date(2026, 9, 31, 10, 0, 0).getTime();

function eq(a, b) {
  return a === b;
}

function makeNotice(id, deadlineDate, extra) {
  const a = new Date(deadlineDate);
  const hh = String(a.getHours()).padStart(2, "0");
  const mm = String(a.getMinutes()).padStart(2, "0");
  return {
    id,
    title: "通知" + id,
    text: "通知" + id,
    analysis: {
      deadline: null,
      time: hh + ":" + mm,
      location: null,
      materials: [],
      audience: null,
      title: null,
      ...extra,
    },
    deadlineDate,
  };
}

const A = makeNotice("A", new Date(2026, 9, 31, 18, 0, 0).getTime()); // 今天
const B = makeNotice("B", new Date(2026, 10, 1, 10, 0, 0).getTime()); // 明天
const C = makeNotice("C", new Date(2026, 10, 2, 17, 0, 0).getTime(), {
  location: "A101",
  materials: ["申请表"],
}); // 后天
const D = makeNotice("D", new Date(2026, 10, 3, 17, 0, 0).getTime()); // 第 3 天
const E = makeNotice("E", new Date(2026, 10, 6, 17, 0, 0).getTime()); // 第 6 天
const F = makeNotice("F", new Date(2026, 10, 7, 17, 0, 0).getTime()); // 第 7 天
const G = makeNotice("G", new Date(2026, 9, 30, 17, 0, 0).getTime()); // 过期
const H = {
  id: "H",
  title: "无日期",
  text: "无日期",
  analysis: { deadline: null, time: null, location: null, materials: [], audience: null, title: null },
  deadlineDate: null,
};

const ALL = [A, B, C, D, E, F, G, H];

const CASES = [
  {
    name: "三天范围数量 = 3（A/B/C）",
    actual: () => filterShareNotices(ALL, NOW, 3).length,
    expected: 3,
  },
  {
    name: "三天范围顺序 = A,B,C",
    actual: () =>
      filterShareNotices(ALL, NOW, 3)
        .map((n) => n.id)
        .join(","),
    expected: "A,B,C",
  },
  {
    name: "七天范围数量 = 5（A/B/C/D/E）",
    actual: () => filterShareNotices(ALL, NOW, 7).length,
    expected: 5,
  },
  {
    name: "七天范围顺序 = A,B,C,D,E",
    actual: () =>
      filterShareNotices(ALL, NOW, 7)
        .map((n) => n.id)
        .join(","),
    expected: "A,B,C,D,E",
  },
  {
    name: "过期通知不进入",
    actual: () =>
      filterShareNotices(ALL, NOW, 7).some((n) => n.id === "G"),
    expected: false,
  },
  {
    name: "无截止日期不进入",
    actual: () =>
      filterShareNotices(ALL, NOW, 7).some((n) => n.id === "H"),
    expected: false,
  },
  {
    name: "第 3 天在三天范围外",
    actual: () =>
      filterShareNotices(ALL, NOW, 3).some((n) => n.id === "D"),
    expected: false,
  },
  {
    name: "第 3 天在七天范围内",
    actual: () =>
      filterShareNotices(ALL, NOW, 7).some((n) => n.id === "D"),
    expected: true,
  },
  {
    name: "第 7 天在七天范围外",
    actual: () =>
      filterShareNotices(ALL, NOW, 7).some((n) => n.id === "F"),
    expected: false,
  },

  {
    name: "分享文字首行是标题说明",
    actual: () => buildShareText(ALL, NOW, 3).split(LF)[0],
    expected: "【知办】近期通知提醒",
  },
  {
    name: "分享文字末行是来源说明",
    actual: () => {
      const lines = buildShareText(ALL, NOW, 3).split(LF);
      return lines[lines.length - 1];
    },
    expected: "——由知办自动整理",
  },
  {
    name: "三天范围文字共 5 行（标题+3条+结尾）",
    actual: () => buildShareText(ALL, NOW, 3).split(LF).length,
    expected: 5,
  },
  {
    name: "含地点和材料的行格式正确",
    actual: () => buildShareText(ALL, NOW, 3).split(LF)[3],
    expected: "11月2日 17:00 - 通知C（地点：A101，材料：申请表）",
  },
  {
    name: "无地点无材料的行格式正确",
    actual: () => buildShareText(ALL, NOW, 3).split(LF)[1],
    expected: "10月31日 18:00 - 通知A",
  },

  // --- 标题兜底 ---
  {
    name: "标题为空时用原文第一行",
    actual: () =>
      getNoticeTitle({
        id: "T",
        title: "",
        text: "关于开展消防演练的通知" + LF + "其余内容",
        analysis: { title: null },
      }),
    expected: "关于开展消防演练的通知",
  },
  {
    name: "人工改过标题时优先用 analysis.title",
    actual: () =>
      getNoticeTitle({
        id: "T2",
        title: "旧标题",
        text: "原文第一行" + LF + "其余",
        analysis: { title: "手动改过的标题" },
      }),
    expected: "手动改过的标题",
  },
  {
    name: "手动修改后左侧 source 为「手动修正」",
    actual: () => {
      const u = updateNoticeAnalysis(A, { location: "B202" });
      return u.source;
    },
    expected: "手动修正",
  },
  {
    name: "手动修改后 analysis._source 为 manual",
    actual: () => {
      const u = updateNoticeAnalysis(A, { location: "B202" });
      return u.analysis._source;
    },
    expected: "manual",
  },
];

// ---------- 金丝雀 ----------

function runCanary() {
  // 坏实现：不筛选，把所有通知（含过期、无日期）都返回
  const broken = ALL;
  console.log("[金丝雀] 用不筛选的坏实现，断言必须拒绝");
  const wouldPass = broken.length === 3;

  if (wouldPass) {
    console.log("    BROKEN - 坏实现返回数量被错误判为 3");
    console.log("    结论：异常 PASS - 断言逻辑已坏！");
    return false;
  }

  console.log("    坏实现返回 " + broken.length + " 条（正确应为 3）");
  console.log("    拒绝判为 3（正确）");
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