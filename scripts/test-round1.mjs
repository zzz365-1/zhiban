/**
 * 第一轮自检回归：中文数字时间、零事项兜底、材料边界。
 *
 * 用法：node scripts/test-round1.mjs
 *
 * 全部 import 生产模块，不另抄一份相似的。
 * 断言前不做任何归一化，避免把失败洗成通过。
 *
 * 金丝雀说明：本文件最后有三条「必须失败」的哨兵，
 * 用来证明这套断言真的会报红，而不是永远全绿。
 */

import { extractNotice } from "../app/lib/extractNotice.js";
import { buildItems } from "../app/lib/noticeItems.js";

const TODAY = new Date(2026, 10, 3); // 2026-11-03 周二

let pass = 0;
let fail = 0;
const failures = [];

function check(name, actual, expected) {
  const a = Array.isArray(actual) ? JSON.stringify(actual) : actual;
  const e = Array.isArray(expected) ? JSON.stringify(expected) : expected;
  if (a === e) {
    pass++;
  } else {
    fail++;
    failures.push("  ✗ " + name + "\n      预期：" + e + "\n      实际：" + a);
  }
}

// ---------- 一、中文数字时间 ----------

const TIME_CASES = [
  ["讲座定于11月14日下午两点半在图南楼报告厅举办", "14:30"],
  ["会议定于11月20日上午九点举行", "09:00"],
  ["会议定于11月20日晚上七点举行", "19:00"],
  ["会议定于11月20日下午三点举行", "15:00"],
  ["活动于两点半开始", "02:30"],
  ["会议定于11月20日十点举行", "10:00"],
  ["会议定于11月20日十二点举行", "12:00"],
  ["会议定于11月20日下午3点半举行", "15:30"],
  ["会议定于11月20日下午2点举行", "14:00"],
  ["请于11月20日下午5点前交表", "17:00"],
];

for (const [text, expected] of TIME_CASES) {
  check("中文数字时间 " + text, extractNotice(text).time, expected);
}

// 区间结束时间也吃中文数字
check(
  "区间结束时间 下午两点到四点",
  extractNotice("活动于11月8日下午两点到四点举行").endTime,
  "16:00"
);

// ---------- 二、零事项兜底 ----------

const FALLBACK_CASES = [
  {
    name: "实验室自查（无日期无地点）",
    text: "关于开展实验室安全自查的通知\n请各实验室对照检查表完成自查，发现问题及时整改",
    expectCount: 1,
  },
  {
    name: "毕业生图像采集（区间日期）",
    text:
      "2027届毕业生图像采集通知\n" +
      "毕业生须于11月8日至11月10日每日9:00到16:00携带本人身份证和学生证到体育馆一层完成采集",
    expectCount: 1,
  },
];

for (const c of FALLBACK_CASES) {
  const items = buildItems(c.text, { publishedAt: TODAY });
  check("兜底事项数 " + c.name, items.length, c.expectCount);
}

const gaijiItems = buildItems(FALLBACK_CASES[1].text, { publishedAt: TODAY });
check(
  "图像采集 时间抽到",
  gaijiItems.length > 0 ? gaijiItems[0].time : null,
  "09:00"
);
check(
  "图像采集 材料不含地点动作",
  gaijiItems.length > 0 ? gaijiItems[0].materials.map((m) => m.name) : [],
  ["本人身份证", "学生证"]
);

// ---------- 三、纯告知类必须仍为零事项 ----------

const NEGATIVE_CASES = [
  "我校李明老师荣获2026年度全国优秀教师称号，特此通报。",
  "图书馆新系统已于11月1日上线运行，欢迎使用。",
  "关于2026年寒假放假安排的通知，放假时间为1月20日至2月25日。",
  "经研究决定，张三月同学获得本年度国家奖学金。",
];

for (const text of NEGATIVE_CASES) {
  check(
    "纯告知类零事项 " + text.slice(0, 12),
    buildItems(text, { publishedAt: TODAY }).length,
    0
  );
}

// ---------- 四、材料边界 ----------

check(
  "材料 祈使句前半段不收",
  extractNotice("请各实验室对照检查表完成自查，发现问题及时整改").materials,
  []
);
check(
  "材料 不吞地点与动作",
  extractNotice(
    "毕业生须于11月8日至11月10日每日9:00到16:00携带本人身份证和学生证到体育馆一层完成采集"
  ).materials,
  ["本人身份证", "学生证"]
);
check(
  "材料 原有正确项不丢",
  extractNotice("请各班于11月5日下午5点前将纸质申请表报送至学生资助管理中心").materials,
  ["纸质申请表"]
);
check("材料 报名表不被切坏", extractNotice("请提交报名表").materials, ["报名表"]);

// ---------- 五、金丝雀：这三条必须失败 ----------
// 目的：证明上面那批断言真的会报红。任何一条通过，说明断言写坏了。

const canaries = [
  {
    name: "金丝雀 中文数字时间（故意写错期望）",
    actual: () => extractNotice("会议定于11月20日下午三点举行").time,
    expected: "03:00",
  },
  {
    name: "金丝雀 纯告知类（故意写成有事项）",
    actual: () => buildItems("我校李明老师荣获优秀教师称号，特此通报。", { publishedAt: TODAY }).length,
    expected: 1,
  },
  {
    name: "金丝雀 材料（故意写成会收祈使句）",
    actual: () => extractNotice("请各实验室对照检查表完成自查").materials,
    expected: ["请各实验室对照检查表"],
  },
];

let canaryRed = 0;
for (const c of canaries) {
  const a = Array.isArray(c.actual()) ? JSON.stringify(c.actual()) : c.actual();
  const e = Array.isArray(c.expected) ? JSON.stringify(c.expected) : c.expected;
  if (a !== e) canaryRed++;
}

// ---------- 输出 ----------

console.log("第一轮自检回归");
console.log("  通过 " + pass + " 条，失败 " + fail + " 条");
if (failures.length) {
  console.log("");
  console.log("失败明细：");
  failures.forEach((f) => console.log(f));
}
console.log("");
console.log("金丝雀（三条都应报差异）：实际报差异 " + canaryRed + " / 3");

if (canaryRed !== 3) {
  console.log("金丝雀没有全红，说明断言没有真正生效，判失败。");
  process.exit(1);
}
if (fail > 0) {
  process.exit(1);
}
console.log("全部通过");
