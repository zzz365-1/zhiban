/**
 * 第三轮自检回归：补充通知的识别、匹配、前后对比、落盘与负例。
 *
 * 用法：node scripts/test-round3.mjs
 *
 * 全部 import 生产模块。断言前不做归一化。
 * 末尾两条金丝雀用来证明这套断言真的会报红。
 */

import { buildItems } from "../app/lib/noticeItems.js";
import {
  buildNoticePatch,
  matchPatchTarget,
  buildPatchReview,
  applyPatch,
} from "../app/lib/noticePatch.js";

const ORIG =
  "关于举办2026年校园心理情景剧大赛的通知\n" +
  "请各学院于11月20日17:00前将报名表报送至团委办公室。\n" +
  "决赛定于11月28日晚7点在大礼堂举行，请参赛队伍提前半小时到场。";

const SUPP =
  "关于校园心理情景剧大赛的补充通知\n" +
  "原定11月28日晚7点的决赛调整至12月1日下午2点，地点改为大学生活动中心报告厅，其余安排不变。";

const SUPP_TIME_ONLY =
  "补充通知\n原定11月28日晚7点的决赛时间调整为下午3点，地点不变。";

const NEG_UNDETERMINED =
  "关于举办心理健康讲座的通知\n讲座具体时间另行公布，地点待定，请留意后续安排。";

const NEG_RECEIPT =
  "关于开展2026年寝室文化节的通知\n请各寝室于11月25日前完成报名，逾期不再受理。";

const CANCEL =
  "关于取消原定11月28日决赛的通知\n" +
  "因故取消原定11月28日晚7点的决赛，后续安排另行通知。";

const POSTPONE =
  "延期通知\n原定11月20日截止的报名延期至11月30日17:00，其余要求不变。";

const NOW = 1762000000000;

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

function items() {
  return buildItems(ORIG);
}

// ---------- 一、识别 ----------

check("补充通知能认出来", buildNoticePatch(SUPP).isPatch, true);
check("负例 时间另行公布不认", buildNoticePatch(NEG_UNDETERMINED).isPatch, false);
check("负例 逾期不再受理不认", buildNoticePatch(NEG_RECEIPT).isPatch, false);
check("延期通知能认出来", buildNoticePatch(POSTPONE).isPatch, true);
check("取消通知能认出来", buildNoticePatch(CANCEL).isPatch, true);

// ---------- 二、变更项 ----------

check(
  "三处变更都抽到",
  buildNoticePatch(SUPP).changes.map((c) => c.field + "=" + c.to),
  ["date=12月1日", "time=14:00", "location=大学生活动中心报告厅"]
);
check(
  "取消项只留一个，晚7点算成十九点",
  buildNoticePatch(CANCEL).changes.map((c) => c.field + "=" + c.to),
  ["cancel=null", "time=19:00"]
);

// ---------- 三、匹配到决赛那一条 ----------

const p1 = buildNoticePatch(SUPP);
const m1 = matchPatchTarget(items(), p1);
check("命中决赛那一条", m1.indexes.join(","), "1");
check("不需要人工挑", m1.needPick, false);

// ---------- 四、前后对比 ----------

const review = buildPatchReview(items(), p1, m1.indexes);
check("对比三行", (review.rows || []).length, 3);
check(
  "日期从11月28日改到12月1日",
  review.rows[0].from + "→" + review.rows[0].to,
  "11月28日→12月1日"
);
check(
  "时间从十九点改到十四点",
  review.rows[1].from + "→" + review.rows[1].to,
  "19:00→14:00"
);
check(
  "地点从大礼堂改到活动中心报告厅",
  review.rows[2].from + "→" + review.rows[2].to,
  "大礼堂→大学生活动中心报告厅"
);

// ---------- 五、落盘 ----------

const applied = applyPatch(items(), p1, m1.indexes, NOW);
check(
  "决赛那条改成新的",
  applied.items[1].date + "|" + applied.items[1].time + "|" + applied.items[1].location,
  "12月1日|14:00|大学生活动中心报告厅"
);
check(
  "报名那条一个字都不许变",
  applied.items[0].date + "|" + applied.items[0].time + "|" + applied.items[0].location,
  "11月20日|17:00|团委办公室"
);

// 只改时间那一条
const p2 = buildNoticePatch(SUPP_TIME_ONLY);
const m2 = matchPatchTarget(items(), p2);
const applied2 = applyPatch(items(), p2, m2.indexes, NOW);
check(
  "只改时间时日期与地点不动",
  applied2.items[1].date + "|" + applied2.items[1].time + "|" + applied2.items[1].location,
  "11月28日|15:00|大礼堂"
);

// ---------- 六、金丝雀：这两条必须失败 ----------

const canaries = [
  {
    name: "金丝雀 晚7点（故意写成早上七点）",
    actual: () =>
      buildNoticePatch(CANCEL).changes.map((c) => c.field + "=" + c.to),
    expected: ["cancel=null", "time=07:00"],
  },
  {
    name: "金丝雀 负例（故意认成补充通知）",
    actual: () => buildNoticePatch(NEG_UNDETERMINED).isPatch,
    expected: true,
  },
];

let canaryRed = 0;
for (const c of canaries) {
  const a = Array.isArray(c.actual()) ? JSON.stringify(c.actual()) : c.actual();
  const e = Array.isArray(c.expected) ? JSON.stringify(c.expected) : c.expected;
  if (a !== e) canaryRed++;
}

console.log("第三轮自检回归");
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
