/**
 * 第二轮自检回归：材料限定词与并列项、办理路线排序与日历同源。
 *
 * 用法：node scripts/test-round2.mjs
 *
 * 全部 import 生产模块，断言前不做归一化。
 * 末尾两条金丝雀用来证明这套断言真的会报红。
 */

import { extractNotice } from "../app/lib/extractNotice.js";
import { buildItems } from "../app/lib/noticeItems.js";
import { buildRouteEvents } from "../app/lib/routeEvents.js";

const TODAY = new Date(2026, 10, 3);

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

// ---------- 一、材料必须带限定词 ----------

const MATERIAL_CASES = [
  ["请将报名表和体检报告交到武装部", ["报名表", "体检报告"]],
  ["请提交实习证明和获奖证书复印件", ["实习证明", "获奖证书复印件"]],
  ["请交户口本复印件和家长知情同意书", ["户口本复印件", "家长知情同意书"]],
  [
    "请将纸质申请表和家庭经济困难证明复印件报送至学生资助管理中心",
    ["纸质申请表", "家庭经济困难证明复印件"],
  ],
  ["请携带身份证和选民证，还要带一支黑色笔到现场。", ["身份证", "选民证", "黑色笔"]],
  ["还要带一支黑色笔。", ["黑色笔"]],
  ["请于11月5日下午5点前将纸质申请表报送至学生工作处A302办公室", ["纸质申请表"]],
];

for (const [text, expected] of MATERIAL_CASES) {
  check("材料 " + text.slice(0, 16), extractNotice(text).materials, expected);
}

// ---------- 二、办理路线按时间先后排 ----------

const ROUTE_TEXT =
  "关于2026年冬季征兵报名工作的通知\n" +
  "请有意参军的同学于11月25日17:00前将报名表和体检报告交到武装部办公室行政楼B105。\n" +
  "初检定于12月2日上午8点半在校医院三楼体检中心进行。";

const items = buildItems(ROUTE_TEXT, { publishedAt: TODAY });
check("征兵通知拆出两个事项", items.length, 2);

const events = buildRouteEvents([
  { id: "n1", title: "征兵通知", analysis: { items } },
]);
check("路线摊出两个事件", events.length, 2);

const sortedTs = events.map((e) => e.ts);
const isSorted = sortedTs.every((v, i) => i === 0 || sortedTs[i - 1] <= v);
check("路线按时间升序", isSorted, true);
check("先报名后体检", events[0].timeType, "deadline");

// ---------- 三、路线与日历同源 ----------

const byDate = {};
for (const e of events) {
  const key =
    e.date.getFullYear() +
    "-" +
    (e.date.getMonth() + 1) +
    "-" +
    e.date.getDate();
  if (!byDate[key]) byDate[key] = [];
  byDate[key].push(e.name);
}
check("两个事项落在两个不同日期", Object.keys(byDate).length, 2);
check(
  "11月25日那天是报名",
  (byDate["2026-11-25"] || []).join(",").indexOf("报名表") !== -1,
  true
);
check(
  "12月2日那天是体检",
  (byDate["2026-12-2"] || []).join(",").indexOf("体检") !== -1,
  true
);

// ---------- 四、金丝雀：这两条必须失败 ----------

const canaries = [
  {
    name: "金丝雀 材料限定词（故意丢掉体检）",
    actual: () => extractNotice("请将报名表和体检报告交到武装部").materials,
    expected: ["报名表", "报告"],
  },
  {
    name: "金丝雀 路线排序（故意写成倒序）",
    actual: () => events.map((e) => e.ts).slice().sort((a, b) => b - a),
    expected: sortedTs,
  },
];

let canaryRed = 0;
for (const c of canaries) {
  const a = Array.isArray(c.actual()) ? JSON.stringify(c.actual()) : c.actual();
  const e = Array.isArray(c.expected) ? JSON.stringify(c.expected) : c.expected;
  if (a !== e) canaryRed++;
}

console.log("第二轮自检回归");
console.log("  通过 " + pass + " 条，失败 " + fail + " 条");
if (failures.length) {
  console.log("");
  console.log("失败明细：");
  failures.forEach((f) => console.log(f));
}
console.log("");
console.log("金丝雀（两条都应报差异）：实际报差异 " + canaryRed + " / 2");

if (canaryRed !== 2) {
  console.log("金丝雀没有全红，说明断言没有真正生效，判失败。");
  process.exit(1);
}
if (fail > 0) process.exit(1);
console.log("全部通过");
