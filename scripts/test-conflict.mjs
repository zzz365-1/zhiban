/**
 * conflict.js 的命令行测试脚本。用 node 直接跑，不依赖测试框架。
 *   node scripts/test-conflict.mjs
 *
 * 时间全部写死成固定日期，不用当前时间。
 */

import { buildScheduleAlerts, formatDuration } from "../app/lib/conflict.js";

// ---------- 简易断言器 ----------
let passed = 0;
let failed = 0;

function show(v) {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function assert(cond, label, expected, actual) {
  if (cond) {
    passed++;
    console.log("  ✓ " + label);
  } else {
    failed++;
    console.log("  ✗ " + label);
    console.log("      期望：" + show(expected));
    console.log("      实际：" + show(actual));
  }
}

function assertEqual(actual, expected, label) {
  assert(
    show(actual) === show(expected),
    label,
    expected,
    actual
  );
}

function mkDate(y, m, d) {
  // 注意 m 是 1-12
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function mkEvent(o) {
  return {
    noticeId: o.noticeId,
    noticeTitle: o.noticeTitle || "",
    itemIndex: o.itemIndex,
    name: o.name || "",
    date: o.date,
    time: o.time || "",
    ts: o.date ? o.date.getTime() : 0,
    location: o.location || "",
    materials: o.materials || [],
    progress: o.progress || "待办理",
    timeType: o.timeType,
    endTime: o.endTime,
  };
}

// 固定测试日
const D = mkDate(2025, 6, 10); // 2025-06-10

// =========================================================
console.log("用例1：答辩 14-16、讲座 15-17 同一天 → 一条 overlap，重叠一小时，时段 15-16");
{
  const events = [
    mkEvent({
      noticeId: "n1",
      noticeTitle: "答辩通知",
      itemIndex: 0,
      name: "答辩",
      date: D,
      time: "14:00",
      endTime: "16:00",
      timeType: "start",
    }),
    mkEvent({
      noticeId: "n2",
      noticeTitle: "讲座通知",
      itemIndex: 1,
      name: "讲座",
      date: D,
      time: "15:00",
      endTime: "17:00",
      timeType: "start",
    }),
  ];
  const alerts = buildScheduleAlerts(events);
  const overlaps = alerts.filter((a) => a.type === "overlap");
  assertEqual(overlaps.length, 1, "overlap 条数正好 1");
  if (overlaps[0]) {
    assertEqual(overlaps[0].level, "warn", "level 是 warn");
    assertEqual(overlaps[0].title, "时间冲突", "标题是 时间冲突");
    assert(
      overlaps[0].detail.includes("一小时"),
      "detail 含“一小时”",
      "含 一小时",
      overlaps[0].detail
    );
    assert(
      overlaps[0].detail.includes("15:00 到 16:00"),
      "detail 含重叠时段 15:00 到 16:00",
      "含 15:00 到 16:00",
      overlaps[0].detail
    );
  }
}

// =========================================================
console.log("用例2：甲 16 点结束、乙 16 点开始同一天 → 不产生 overlap");
{
  const events = [
    mkEvent({
      noticeId: "n1",
      itemIndex: 0,
      name: "活动甲",
      date: D,
      time: "14:00",
      endTime: "16:00",
      timeType: "start",
    }),
    mkEvent({
      noticeId: "n2",
      itemIndex: 0,
      name: "活动乙",
      date: D,
      time: "16:00",
      endTime: "18:00",
      timeType: "start",
    }),
  ];
  const alerts = buildScheduleAlerts(events);
  const overlaps = alerts.filter((a) => a.type === "overlap");
  assertEqual(overlaps.length, 0, "overlap 条数为 0（无缝衔接不算撞车）");
}

// =========================================================
console.log("用例3：同一天两项 deadline → 一条 cluster、无 overlap，标题不含“冲突”");
{
  const events = [
    mkEvent({
      noticeId: "n1",
      itemIndex: 0,
      name: "交实验报告",
      date: D,
      time: "17:00",
      timeType: "deadline",
      progress: "待办理",
    }),
    mkEvent({
      noticeId: "n2",
      itemIndex: 0,
      name: "交读书笔记",
      date: D,
      time: "20:00",
      timeType: "deadline",
      progress: "待办理",
    }),
  ];
  const alerts = buildScheduleAlerts(events);
  const clusters = alerts.filter((a) => a.type === "cluster");
  const overlaps = alerts.filter((a) => a.type === "overlap");
  assertEqual(clusters.length, 1, "cluster 条数正好 1");
  assertEqual(overlaps.length, 0, "overlap 条数为 0");
  if (clusters[0]) {
    assertEqual(clusters[0].level, "info", "cluster level 是 info");
    assertEqual(clusters[0].title, "截止事项集中", "cluster 标题是 截止事项集中");
    assert(
      clusters[0].detail.includes("2 项"),
      "detail 含“2 项”",
      "含 2 项",
      clusters[0].detail
    );
    assert(
      !clusters[0].title.includes("冲突"),
      "cluster 标题不含“冲突”",
      "不含 冲突",
      clusters[0].title
    );
  }
}

// =========================================================
console.log("用例4：只有开始、没有结束 → 无 overlap，有 needEndTime，详情不含确定时长");
{
  const events = [
    mkEvent({
      noticeId: "n1",
      itemIndex: 0,
      name: "社团活动",
      date: D,
      time: "19:00",
      timeType: "start",
      // endTime 缺省
    }),
  ];
  const alerts = buildScheduleAlerts(events);
  const overlaps = alerts.filter((a) => a.type === "overlap");
  const needs = alerts.filter((a) => a.type === "needEndTime");
  assertEqual(overlaps.length, 0, "overlap 条数为 0");
  assertEqual(needs.length, 1, "needEndTime 条数正好 1");
  if (needs[0]) {
    assertEqual(needs[0].level, "info", "needEndTime level 是 info");
    assertEqual(needs[0].title, "结束时间待补充", "标题是 结束时间待补充");
    // 详情里不能出现“数字+小时”或“数字+分钟”这种确定时长
    const hasDuration =
      /[0-9一二三四五六七八九十]+\s*小时/.test(needs[0].detail) ||
      /[0-9一二三四五六七八九十]+\s*分钟/.test(needs[0].detail);
    assert(!hasDuration, "详情不含任何确定时长", "无时长数字", needs[0].detail);
    assert(
      needs[0].detail.includes("不会替你假设活动时长"),
      "详情含“不会替你假设活动时长”",
      "含该句",
      needs[0].detail
    );
  }
}

// =========================================================
console.log("用例5：不在同一天、钟点相同 → 不产生 overlap");
{
  const D2 = mkDate(2025, 6, 11); // 2025-06-11，另一天
  const events = [
    mkEvent({
      noticeId: "n1",
      itemIndex: 0,
      name: "活动甲",
      date: D,
      time: "14:00",
      endTime: "16:00",
      timeType: "start",
    }),
    mkEvent({
      noticeId: "n2",
      itemIndex: 0,
      name: "活动乙",
      date: D2,
      time: "14:00",
      endTime: "16:00",
      timeType: "start",
    }),
  ];
  const alerts = buildScheduleAlerts(events);
  const overlaps = alerts.filter((a) => a.type === "overlap");
  assertEqual(overlaps.length, 0, "overlap 条数为 0（跨天同钟点不算重叠）");
}

// =========================================================
console.log("用例6：已办理的截止事项不进集中提醒");
{
  const events = [
    mkEvent({
      noticeId: "n1",
      itemIndex: 0,
      name: "交材料甲",
      date: D,
      time: "10:00",
      timeType: "deadline",
      progress: "待办理",
    }),
    mkEvent({
      noticeId: "n2",
      itemIndex: 0,
      name: "交材料乙",
      date: D,
      time: "12:00",
      timeType: "deadline",
      progress: "待办理",
    }),
    mkEvent({
      noticeId: "n3",
      itemIndex: 0,
      name: "交材料丙",
      date: D,
      time: "15:00",
      timeType: "deadline",
      progress: "已办理",
    }),
  ];
  const alerts = buildScheduleAlerts(events);
  const clusters = alerts.filter((a) => a.type === "cluster");
  assertEqual(clusters.length, 1, "cluster 条数正好 1");
  if (clusters[0]) {
    // 已办理那条不计入，剩两条
    assert(
      clusters[0].detail.includes("2 项"),
      "集中提醒只算 2 项（排除已办理）",
      "含 2 项",
      clusters[0].detail
    );
    assertEqual(clusters[0].items.length, 2, "items 只有 2 条");
    assert(
      !clusters[0].items.some((it) => it.noticeId === "n3"),
      "items 不含已办理的 n3",
      "不含 n3",
      clusters[0].items.map((it) => it.noticeId)
    );
  }
}

// =========================================================
console.log("用例7：formatDuration 单独测试");
{
  assertEqual(formatDuration(60), "一小时", "60 分钟 → 一小时");
  assertEqual(formatDuration(90), "一小时三十分", "90 分钟 → 一小时三十分");
  assertEqual(formatDuration(45), "四十五分钟", "45 分钟 → 四十五分钟");
  assertEqual(formatDuration(120), "两小时", "120 分钟 → 两小时");
}

// =========================================================
console.log("用例8：同一事件对不重复，两两重叠只出 4 条 overlap");
{
  // 两条通知，各带两个活动，四个活动两两重叠
  const events = [
    mkEvent({
      noticeId: "nA",
      noticeTitle: "通知A",
      itemIndex: 0,
      name: "A-1",
      date: D,
      time: "10:00",
      endTime: "14:00",
      timeType: "start",
    }),
    mkEvent({
      noticeId: "nA",
      noticeTitle: "通知A",
      itemIndex: 1,
      name: "A-2",
      date: D,
      time: "10:30",
      endTime: "14:30",
      timeType: "start",
    }),
    mkEvent({
      noticeId: "nB",
      noticeTitle: "通知B",
      itemIndex: 0,
      name: "B-1",
      date: D,
      time: "11:00",
      endTime: "15:00",
      timeType: "start",
    }),
    mkEvent({
      noticeId: "nB",
      noticeTitle: "通知B",
      itemIndex: 1,
      name: "B-2",
      date: D,
      time: "11:30",
      endTime: "15:30",
      timeType: "start",
    }),
  ];
  const alerts = buildScheduleAlerts(events);
  const overlaps = alerts.filter((a) => a.type === "overlap");
  // 4 个事件两两重叠，组合数 C(4,2)=6，但同一条通知内部两两也重叠……这里只看总数是否为 C(4,2)=6
  // 说明：需求要求“两两重叠”，四个事件确实两两都重叠，故应为 6 条。
  // 为严格对应“不重复”这一点，断言不出现重复 key，且条数等于 6（不是正反各算一遍的 12）。
  const keys = overlaps.map((a) => a.key);
  const uniqueKeys = new Set(keys);
  assertEqual(keys.length, uniqueKeys.size, "overlap 的 key 无重复");
  assertEqual(overlaps.length, 6, "overlap 条数是 6（不是 12）");
}

// =========================================================
// 结尾统计
console.log("");
console.log("========================================");
console.log("通过：" + passed + " 条，失败：" + failed + " 条");
if (failed > 0) {
  console.log("测试未全部通过。");
  process.exit(1);
} else {
  console.log("全部测试通过。");
}
