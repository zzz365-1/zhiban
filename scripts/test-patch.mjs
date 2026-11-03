/**
 * 第 3 轮 补充通知的变更对比与安排同步
 *
 * 只用生产模块：noticeItems 的 buildItems、noticePatch 的三个新函数、routeEvents。
 * 不另抄一份实现（Dec-022），全部零网络。
 */
import { buildItems } from "../app/lib/noticeItems.js";
import {
  buildNoticePatch,
  matchPatchTarget,
  buildPatchReview,
  applyPatch,
} from "../app/lib/noticePatch.js";
import { buildRouteEvents } from "../app/lib/routeEvents.js";

const ORIG =
  "关于2026年国家助学金评审工作安排的通知\n" +
  "请各班于11月5日下午5点前将纸质申请表报送至学生工作处A302办公室。\n" +
  "评审会定于11月8日晚7点在行政楼A302会议室召开，请相关同学准时参加。";

const SUPP =
  "关于助学金评审会的补充通知\n" +
  "原定11月8日的助学金评审会调整至11月9日19:00，地点改为行政楼B201会议室，其余安排不变。";

// 第四轮回归：普通助学金通知，含逾期不再受理这种收件说明，不是补充通知
const PLAIN =
  "关于2026年国家助学金评审工作安排的通知\n" +
  "各班请于11月5日下午5点前将纸质申请表报送至学生工作处A302办公室，逾期不再受理。\n" +
  "评审会定于11月8日晚7点在行政楼A302会议室召开，请各班班长届时到场。";

// 第四轮回归：真正的补充通知，要求日期和地点都抽到
const SUPP2 =
  "补充通知，原定11月8日的助学金评审会调整至11月9日19:00，" +
  "地点改为行政楼B201会议室，其余安排不变。";

const NOW = 1762000000000;

function items(progress0, progress1) {
  const list = buildItems(ORIG);
  if (progress0) list[0].progress = progress0;
  if (progress1) list[1].progress = progress1;
  return list;
}

const CASES = [];
function t(name, fn, expected) {
  CASES.push({ name, fn, expected });
}

// ---- 1 匹配 ----
t("补充通知只匹配到评审会那一条", () => {
  const p = buildNoticePatch(SUPP);
  const m = matchPatchTarget(items(), p);
  return m.indexes.join(",") + "|" + m.needPick;
}, "1|false");

t("匹配不到时必须让用户自己挑", () => {
  const p = buildNoticePatch("关于助学金的补充通知\n报名截止时间调整至11月20日。");
  const m = matchPatchTarget(items(), p);
  return m.indexes.join(",") + "|" + m.needPick;
}, "|true");

// ---- 2 对比 ----
t("对比出三行，日期时间地点各一行", () => {
  const p = buildNoticePatch(SUPP);
  const m = matchPatchTarget(items(), p);
  const r = buildPatchReview(items(), p, m.indexes);
  return r.rows.map((x) => x.field).join(",");
}, "date,time,location");

t("变化前取原通知的真实值", () => {
  const p = buildNoticePatch(SUPP);
  const m = matchPatchTarget(items(), p);
  const r = buildPatchReview(items(), p, m.indexes);
  return r.rows.map((x) => x.field + "=" + (x.from == null ? "空" : x.from)).join(" ");
}, "date=11月8日 time=19:00 location=行政楼A302会议室");

t("变化后取补充通知的新值", () => {
  const p = buildNoticePatch(SUPP);
  const m = matchPatchTarget(items(), p);
  const r = buildPatchReview(items(), p, m.indexes);
  return r.rows.map((x) => x.field + "=" + (x.to == null ? "空" : x.to)).join(" ");
}, "date=11月9日 time=19:00 location=行政楼B201会议室");

t("每一行都带补充通知里的依据原句", () => {
  const p = buildNoticePatch(SUPP);
  const m = matchPatchTarget(items(), p);
  const r = buildPatchReview(items(), p, m.indexes);
  const bad = r.rows.filter((x) => !x.quote || SUPP.indexOf(x.quote) === -1);
  return bad.length;
}, 0);

t("时间和补充通知一样时不算变化", () => {
  const p = buildNoticePatch(SUPP);
  const m = matchPatchTarget(items(), p);
  const r = buildPatchReview(items(), p, m.indexes);
  const t1 = r.rows.find((x) => x.field === "time");
  return t1.kind;
}, "unchanged");

t("没动过的事项要单独列出来", () => {
  const p = buildNoticePatch(SUPP);
  const m = matchPatchTarget(items(), p);
  const r = buildPatchReview(items(), p, m.indexes);
  return r.untouched.map((x) => x.index + ":" + x.itemName).join(",");
}, "0:提交纸质申请表");

// ---- 3 落盘 ----
t("只改评审会的日期和地点", () => {
  const p = buildNoticePatch(SUPP);
  const m = matchPatchTarget(items(), p);
  const out = applyPatch(items(), p, m.indexes, NOW);
  const it = out.items[1];
  return it.date + "|" + it.time + "|" + it.location;
}, "11月9日|19:00|行政楼B201会议室");

t("申请表那一条一个字都不许变", () => {
  const p = buildNoticePatch(SUPP);
  const m = matchPatchTarget(items(), p);
  const out = applyPatch(items(), p, m.indexes, NOW);
  const it = out.items[0];
  return (
    it.date + "|" + it.time + "|" + it.location + "|" +
    (it.materials || []).map((x) => x.name).join("+") + "|" + it.progress
  );
}, "11月5日|17:00|学生工作处A302办公室|纸质申请表|待办理");

t("已完成的无关事项保持已完成", () => {
  const p = buildNoticePatch(SUPP);
  const m = matchPatchTarget(items("已办理", null), p);
  const out = applyPatch(items("已办理", null), p, m.indexes, NOW);
  return out.items[0].progress + "|" + out.items[0].date;
}, "已办理|11月5日");

t("改的是已完成的事项时不回退状态只提醒", () => {
  const p = buildNoticePatch(SUPP);
  const src = items(null, "已办理");
  const m = matchPatchTarget(src, p);
  const out = applyPatch(src, p, m.indexes, NOW);
  const hasAlert = out.alerts.some((a) => a.indexOf("完成") !== -1);
  return out.items[1].progress + "|" + hasAlert + "|" + out.items[1].date;
}, "已办理|true|11月9日");

t("原数组不许被改写", () => {
  const p = buildNoticePatch(SUPP);
  const src = items();
  const m = matchPatchTarget(src, p);
  applyPatch(src, p, m.indexes, NOW);
  return src[1].date + "|" + src[1].location;
}, "11月8日|行政楼A302会议室");

t("历史里记下真正改了的两条", () => {
  const p = buildNoticePatch(SUPP);
  const m = matchPatchTarget(items(), p);
  const out = applyPatch(items(), p, m.indexes, NOW);
  return out.record.changes.map((c) => c.field).join(",");
}, "date,location");

t("历史里带时间和依据", () => {
  const p = buildNoticePatch(SUPP);
  const m = matchPatchTarget(items(), p);
  const out = applyPatch(items(), p, m.indexes, NOW);
  const c = out.record.changes[0];
  return (out.record.time === NOW) + "|" + (c.quote ? "有依据" : "无依据") + "|" + (c.from === "11月8日");
}, "true|有依据|true");

// ---- 4 取消 ----
t("取消不删事项只打标记", () => {
  const text = "关于助学金评审会的补充通知\n评审会取消。";
  const p = buildNoticePatch(text);
  const m = matchPatchTarget(items(), p);
  const out = applyPatch(items(), p, m.indexes, NOW);
  return (
    out.items[1].cancelled + "|" + out.items[1].progress +
    "|" + (out.items.length === 2) + "|" + out.alerts.length
  );
}, "true|无需办理|true|1");

// ---- 5 新增材料 ----
t("新增材料追加不替换且默认没准备", () => {
  const text = "关于助学金评审会的补充通知\n评审会需提交身份证复印件。";
  const p = buildNoticePatch(text);
  const m = matchPatchTarget(items(), p);
  const out = applyPatch(items(), p, m.indexes, NOW);
  const mats = out.items[1].materials || [];
  return (
    mats.map((x) => x.name + ":" + x.ready).join("+") +
    "|" + out.alerts.some((a) => a.indexOf("材料") !== -1)
  );
}, "身份证复印件:false|true");

// ---- 6 日历同源 ----
t("日历跟着改到新日期", () => {
  const p = buildNoticePatch(SUPP);
  const src = items();
  const m = matchPatchTarget(src, p);
  const out = applyPatch(src, p, m.indexes, NOW);
  const notice = { id: "n1", title: "助学金", analysis: { items: out.items } };
  const evs = buildRouteEvents([notice]);
  const d1 = evs.find((e) => e.name === "参加评审会");
  return d1.date.getMonth() + 1 + "月" + d1.date.getDate() + "日" + "|" + d1.location;
}, "11月9日|行政楼B201会议室");

t("日历里申请表那天不动", () => {
  const p = buildNoticePatch(SUPP);
  const src = items();
  const m = matchPatchTarget(src, p);
  const out = applyPatch(src, p, m.indexes, NOW);
  const notice = { id: "n1", title: "助学金", analysis: { items: out.items } };
  const evs = buildRouteEvents([notice]);
  const d0 = evs.find((e) => e.name === "提交纸质申请表");
  return d0.date.getMonth() + 1 + "月" + d0.date.getDate() + "日" + "|" + d0.ts;
}, "11月5日|" + new Date(2026, 10, 5, 17, 0).getTime());

// ---- 7 歧义 ----
t("说不清的补充通知要记歧义", () => {
  const p = buildNoticePatch("评审会时间另行通知。");
  return p.ambiguities.length > 0;
}, true);

t("有歧义时不许落盘", () => {
  const p = buildNoticePatch("评审会时间另行通知。");
  return p.changes.length;
}, 0);

// ---- 8 第四轮回归 ----
t("普通通知不被当成补充通知且变更数组为空", () => {
  const p = buildNoticePatch(PLAIN);
  return p.isPatch + "|" + p.changes.length;
}, "false|0");

t("真补充通知仍是补充通知且同时抽出日期和地点", () => {
  const p = buildNoticePatch(SUPP2);
  const fields = p.changes.map((c) => c.field);
  return (
    p.isPatch + "|" +
    (fields.indexOf("date") !== -1) + "|" +
    (fields.indexOf("location") !== -1)
  );
}, "true|true|true");

// ---- 9 第六轮回归：待定类说法不许把普通新通知劫持进补充通知 ----
t("带抬头且时间另行通知地点待定的新通知不算补充通知", () => {
  const text =
    "关于留学讲座的通知\n" +
    "时间另行通知，地点待定，请留意后续安排。";
  const p = buildNoticePatch(text);
  return p.isPatch + "|" + p.changes.length;
}, "false|0");

t("单独一句评审会时间另行通知仍记歧义", () => {
  const p = buildNoticePatch("评审会时间另行通知。");
  return p.isPatch + "|" + (p.ambiguities.length > 0);
}, "true|true");

t("有原定回指的另行通知仍是补充通知", () => {
  const text =
    "关于助学金评审会的补充通知\n" +
    "原定十一月八日的助学金评审会时间另行通知，其余安排不变。";
  const p = buildNoticePatch(text);
  return p.isPatch + "|" + (p.ambiguities.length > 0);
}, "true|true");

// ---- 跑 ----
let pass = 0;
let fail = 0;
for (const c of CASES) {
  let actual;
  try {
    actual = c.fn();
  } catch (e) {
    actual = "抛错 " + e.message;
  }
  if (String(actual) === String(c.expected)) {
    pass++;
    console.log("PASS  " + c.name);
  } else {
    fail++;
    console.log("FAIL  " + c.name);
    console.log("        期望 " + c.expected);
    console.log("        实际 " + actual);
  }
}
console.log("");
console.log("业务结果 " + pass + " 通过 " + fail + " 失败");
process.exit(fail === 0 ? 0 : 1);
