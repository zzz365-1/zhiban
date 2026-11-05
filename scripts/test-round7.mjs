/**
 * 第七轮自检回归：日期时间语义、事项动作命名、时间类型统一、
 * 疑似重复分级、工作台顺序与缺结束时间聚合。
 *
 * 用法：node scripts/test-round7.mjs
 *
 * 动态断言全部 import 生产模块，断言前不做归一化。
 * 静态断言 readFileSync 读真实源码，钉住跨文件接线与界面文案。
 * 全程零网络零密钥。末尾两条金丝雀故意期待失败，用来证明断言真的会报红。
 */

import { readFileSync } from "node:fs";
import { extractNotice } from "../app/lib/extractNotice.js";
import { buildItems, getNoticeTimeType } from "../app/lib/noticeItems.js";
import {
  buildDeadlineDate,
  hasExplicitTime,
  NO_TIME_NOTE,
} from "../app/lib/deadline.js";
import { buildRouteEvents } from "../app/lib/routeEvents.js";
import { buildShareText } from "../app/lib/shareText.js";
import { formatRemaining } from "../app/lib/todo.js";
import {
  checkDuplicate,
  checkBatchDuplicates,
  textSimilarity,
  SIMILAR_THRESHOLD,
} from "../app/lib/dedupe.js";
import { buildScheduleAlerts } from "../app/lib/conflict.js";

const OPTS = { publishedAt: "" };
const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

const deadlineSrc = read("../app/lib/deadline.js");
const routeSrc = read("../app/lib/routeEvents.js");
const shareSrc = read("../app/lib/shareText.js");
const itemsSrc = read("../app/lib/noticeItems.js");
const dedupeSrc = read("../app/lib/dedupe.js");
const analysisPanelSrc = read("../app/components/AnalysisPanel.js");
const multiSrc = read("../app/components/MultiResultPanel.js");
const itemCardSrc = read("../app/components/ItemCard.js");
const calendarSrc = read("../app/components/CalendarPage.js");
const todoListSrc = read("../app/components/TodoList.js");
const calendarViewSrc = read("../app/components/CalendarView.js");
const itemsPanelSrc = read("../app/components/ItemsPanel.js");
const pageSrc = read("../app/page.js");
const dupDialogSrc = read("../app/components/DuplicateDialog.js");
const workspaceSrc = read("../app/components/WorkspaceOverview.js");
const scheduleAlertsSrc = read("../app/components/ScheduleAlerts.js");
const patchReviewSrc = read("../app/components/PatchReviewDialog.js");

let pass = 0;
let fail = 0;
const failures = [];

function check(name, actual, expected) {
  const a = Array.isArray(actual) ? JSON.stringify(actual) : actual;
  const e = Array.isArray(expected) ? JSON.stringify(expected) : expected;
  if (a === e) pass++;
  else {
    fail++;
    failures.push(
      "  x " + name + "\n      预期：" + e + "\n      实际：" + a
    );
  }
}

// ---------- 素材 ----------
const T_A1 =
  "关于本季青年大学习网上主题团课的通知\n" +
  "请全体团员于11月9日前完成本季青年大学习网上主题团课。";
const T_A2 =
  "关于核对2026级本科生学籍信息的通知\n" +
  "请各位同学于11月12日前登录教务系统核对个人学籍信息，逾期不再受理。";
const T_B =
  "学术讲座通知\n学术讲座定于11月14日14:30在图书馆报告厅举行。";
const T_C =
  "关于2026年国家助学金评审工作安排的通知\n" +
  "各班请于11月5日下午5点前将纸质申请表报送至学生工作处A302办公室，逾期不再受理。\n" +
  "评审会定于11月8日晚7点在行政楼A302会议室召开，请各班班长届时到场。";
const T_F2 =
  "关于2026年国家助学金评审工作安排的通知\n" +
  "请各班于11月5日下午5点前将纸质申请表交至学生工作处A302办公室，逾期不再受理。\n" +
  "评审会定于11月8日晚7点在行政楼A302会议室召开，请各班班长准时到场。";
const T_F3 =
  "关于2026年国家助学金评审工作安排的通知\n" +
  "现将国家助学金评选条件予以公示，请有异议的同学于11月20日前向学生工作处反映。\n" +
  "咨询电话另行公布。";
const T_NEW = "关于图书馆闭馆的通知\n图书馆将于11月25日起闭馆整理，开馆时间另行通知。";

function makeNotice(id, text) {
  const a = extractNotice(text);
  const items = buildItems(text, OPTS);
  const dd = buildDeadlineDate(a.deadline, a.time);
  return {
    id,
    title: text.split("\n")[0],
    text,
    analysis: { ...a, items },
    items,
    deadlineDate: dd ? dd.getTime() : null,
  };
}

const nA1 = makeNotice("n-A1", T_A1);
const nA2 = makeNotice("n-A2", T_A2);
const nB = makeNotice("n-B", T_B);
const nC = makeNotice("n-C", T_C);
const all = [nA1, nA2, nB, nC];
const evs = buildRouteEvents(all);
const evA1 = evs.find((e) => e.noticeId === "n-A1");
const evA2 = evs.find((e) => e.noticeId === "n-A2");
const evB = evs.find((e) => e.noticeId === "n-B");
const evC1 = evs.filter((e) => e.noticeId === "n-C")[0];
const evC2 = evs.filter((e) => e.noticeId === "n-C")[1];

// ---------- 一、日期与时间：原文没写时刻就不外显时刻 ----------
check("NO_TIME_NOTE 常量", NO_TIME_NOTE, "具体时刻未说明");
check("hasExplicitTime 空值", hasExplicitTime(null), false);
check("hasExplicitTime 空串", hasExplicitTime(""), false);
check("hasExplicitTime 明确时刻", hasExplicitTime("14:30"), true);
check("hasExplicitTime 中文说法不算 HH:mm", hasExplicitTime("下午5点"), false);
check("A1 内部排序基准落在当天零点", new Date(nA1.deadlineDate).getHours(), 0);
check("A2 内部排序基准落在当天零点", new Date(nA2.deadlineDate).getHours(), 0);
check("A1 内部排序分钟也是零", new Date(nA1.deadlineDate).getMinutes(), 0);
check("C 写了下午5点仍是17点，不回归", new Date(nC.deadlineDate).getHours(), 17);
check("B 写了14:30仍是14点30分", new Date(nB.deadlineDate).getHours(), 14);

check("A1 事件 time 为空，不把内部零点外显", evA1.time, "");
check("A1 事件标无明确时刻", evA1.hasExplicitTime, false);
check("A1 事件给出时刻说明", evA1.timeNote, NO_TIME_NOTE);
check("A2 事件 time 为空", evA2.time, "");
check("A2 事件标无明确时刻", evA2.hasExplicitTime, false);
check("B 事件 time 是讲座开始时刻", evB.time, "14:30");
check("B 事件标有明确时刻", evB.hasExplicitTime, true);
check("B 事件没有时刻说明", evB.timeNote, "");
check("C 交表事件仍是17:00", evC1.time, "17:00");
check("C 评审会事件仍是19:00", evC2.time, "19:00");
check("A1 排在 A2 前面，排序没坏", evA1.ts < evA2.ts, true);

const shareAll = buildShareText(
  all.filter((n) => n.deadlineDate),
  new Date(2026, 10, 4, 12, 0).getTime(),
  30
);
check(
  "汇总文字给 A1 标注具体时刻未说明",
  shareAll.includes("11月9日（具体时刻未说明）"),
  true
);
check(
  "汇总文字给 A2 标注具体时刻未说明",
  shareAll.includes("11月12日（具体时刻未说明）"),
  true
);
const shareDateOnly = buildShareText(
  [nA1, nA2],
  new Date(2026, 10, 4, 12, 0).getTime(),
  30
);
check("只有日期的两条汇总不出现17:00", shareDateOnly.includes("17:00"), false);
check("只有日期的两条汇总不出现00:00", shareDateOnly.includes("00:00"), false);
check("只有日期的两条汇总不出现23:59", shareDateOnly.includes("23:59"), false);

const hourTs = new Date(2026, 10, 9, 0, 0).getTime();
const hourNow = new Date(2026, 10, 8, 20, 0).getTime();
check(
  "不传 dateOnly 时旧行为仍是剩 N 小时",
  formatRemaining(hourTs, hourNow, false).text,
  "剩 4 小时"
);
check(
  "原文没写时刻时不再报剩 N 小时",
  formatRemaining(hourTs, hourNow, true).text,
  "剩 1 天"
);

// ---------- 二、事项名称按原文动作生成 ----------
check(
  "A1 事项名按完成团课生成",
  nA1.items[0].name,
  "完成本季青年大学习网上主题团课"
);
check("A2 事项名按核对学籍生成", nA2.items[0].name, "核对个人学籍信息");
check("A1 不再叫提交材料", nA1.items[0].name.includes("提交材料"), false);
check("A2 不再叫提交材料", nA2.items[0].name.includes("提交材料"), false);
check(
  "同类新说法 完成缴费",
  buildItems("请于11月20日前完成缴费。", OPTS)[0].name,
  "完成缴费"
);
check(
  "同类新说法 参加会议",
  buildItems("请全体同学于11月21日参加会议。", OPTS)[0].name,
  "参加会议"
);
check(
  "同类新说法 到场签到",
  buildItems("请各班班长于11月22日下午3点前到场签到。", OPTS)[0].name,
  "到场签到"
);
check(
  "同类新说法 提交报名表",
  buildItems("请全体同学于11月23日前提交报名表。", OPTS)[0].name,
  "提交报名表"
);
check(
  "判断不出动作时用待确认的谨慎名字",
  buildItems("请按通知要求办理。", OPTS)[0].name,
  "待确认办理事项"
);
check("C 仍拆出两个事项", nC.items.length, 2);
check("C 第一项仍是提交纸质申请表", nC.items[0].name, "提交纸质申请表");
check("C 第二项仍是参加评审会", nC.items[1].name, "参加评审会");
check("C 交表时刻不回归", nC.items[0].time, "17:00");
check("C 评审会时刻不回归", nC.items[1].time, "19:00");
check("C 交表地点不串", nC.items[0].location, "学生工作处A302办公室");
check("C 评审会地点不串", nC.items[1].location, "行政楼A302会议室");
check("C 交表材料不被清空", nC.items[0].materials.length, 1);
check("C 评审会不冒出材料", nC.items[1].materials.length, 0);
check(
  "系统建议与通知要求在界面上分区",
  itemsPanelSrc.includes("系统建议不是通知里的要求"),
  true
);
check(
  "动作词表不含整句样例，不是给样例写死",
  itemsSrc.includes('"完成本季青年大学习网上主题团课"'),
  false
);

// ---------- 三、时间类型在各页面统一 ----------
check(
  "讲座整条通知判为开始类",
  getNoticeTimeType(nB.analysis),
  "start"
);
check("A1 整条通知判为截止类", getNoticeTimeType(nA1.analysis), "deadline");
check(
  "同一通知同时有截止和开始，主类型仍按截止",
  getNoticeTimeType(nC.analysis),
  "deadline"
);
check(
  "批量预览按时间类型切标签",
  multiSrc.includes('label={timeType === "start" ? "开始" : "截止"}'),
  true
);
check("解析页讲座日期叫活动日期", analysisPanelSrc.includes('"活动日期"'), true);
check("解析页讲座时刻叫开始时间", analysisPanelSrc.includes('"开始时间"'), true);
check("解析页接入时刻说明常量", analysisPanelSrc.includes("NO_TIME_NOTE"), true);
check("批量预览接入时刻说明常量", multiSrc.includes("NO_TIME_NOTE"), true);
check("事项卡无时刻时显示日期", itemCardSrc.includes("NO_TIME_NOTE"), true);
check("日历页无时刻时显示说明", calendarSrc.includes("NO_TIME_NOTE"), true);
check("旧日历组件也同步", calendarViewSrc.includes("NO_TIME_NOTE"), true);
check("旧待办列表按自然日算", todoListSrc.includes("item.hasExplicitTime === false"), true);

// ---------- 四、疑似重复分级 ----------
check("完全重复判为 exact", checkDuplicate(T_C, [nC]).type, "exact");
check("少量措辞变化判为 similar", checkDuplicate(T_F2, [nC]).type, "similar");
check("标题相同内容不同判为 title_same", checkDuplicate(T_F3, [nC]).type, "title_same");
check("全新通知判为 none", checkDuplicate(T_NEW, [nC]).type, "none");
check(
  "少量措辞变化相似度在阈值之上",
  textSimilarity(T_C, T_F2) >= SIMILAR_THRESHOLD,
  true
);
check(
  "标题相同内容不同相似度在阈值之下",
  textSimilarity(T_C, T_F3) < SIMILAR_THRESHOLD,
  true
);
check(
  "similar 分支排在 title_same 之前，不能只凭标题合并",
  dedupeSrc.indexOf('type: "similar"') < dedupeSrc.indexOf('type: "title_same"'),
  true
);

const batchDup = checkBatchDuplicates([T_C, T_F2, T_C], []);
check("批内首条未命中", batchDup[0].type, "none");
check("批内第二条判为疑似重复", batchDup[1].type, "similar");
check("批内第二条标为同批次", batchDup[1].withinBatch, true);
check("批内第三条判为完全重复", batchDup[2].type, "exact");
check("批内第三条标为同批次", batchDup[2].withinBatch, true);
const batchWithExisting = checkBatchDuplicates([T_F2], [nC]);
check("与已有通知命中时不标同批次", batchWithExisting[0].withinBatch, false);

// 新增：命中已有通知时按档位分流，不能被降级成 none
check(
  "与已有通知相似也判为 similar",
  checkBatchDuplicates([T_F2], [nC])[0].type,
  "similar"
);

check("单条弹窗有疑似重复档位", dupDialogSrc.includes("疑似重复的通知已存在"), true);
check("单条弹窗有明确另存", dupDialogSrc.includes("明确另存"), true);
check("单条弹窗有跳过", dupDialogSrc.includes("跳过"), true);
check("单条弹窗有查看已有", dupDialogSrc.includes("查看已有"), true);
check("单条弹窗保留原来的仍然导入", dupDialogSrc.includes("仍然导入"), true);
check("批量面板有跳过本条", multiSrc.includes("跳过本条"), true);
check("批量面板有明确另存", multiSrc.includes("明确另存"), true);
check("批量面板有查看已有正文", multiSrc.includes("查看已有正文"), true);
check("批量面板按档位显示徽标", multiSrc.includes("DUP_LABEL"), true);
check(
  "批量面板能从已有通知展开原文",
  multiSrc.includes("it.dupInfo.notice.text"),
  true
);
check("主页面接上批量查重", pageSrc.includes("checkBatchDuplicates(kept, notices)"), true);
check("可保存条数排除跳过项", pageSrc.includes("it.skip !== true && it.analysis"), true);
check("批量面板接上跳过回调", pageSrc.includes("onSkip={handleToggleBatchSkip}"), true);
check("保存时把明确另存标记传下去", pageSrc.includes("keep: it.keep === true"), true);
check(
  "批量保存二次查重换成新查重函数",
  pageSrc.includes("const again = checkDuplicate(item.text, seen);"),
  true
);
check("批量保存对空分析结果有防护", pageSrc.includes("if (!item || !item.analysis) continue;"), true);
check("旧的只比全等函数已从主页面清掉", pageSrc.includes("isDuplicate("), false);

// ---------- 五、用户自设时间与通知规定时间分开 ----------
check("自行补充的结束时间记来源", pageSrc.includes('endTimeSource: value ? "user" : null'), true);
check("事项卡按来源分开显示", itemsPanelSrc.includes('item.endTimeSource === "user"'), true);
check("事项卡写明自行补充", itemsPanelSrc.includes("自行补充"), true);

// ---------- 六、工作台顺序与缺结束时间聚合 ----------
const sectionsBlock = workspaceSrc.slice(
  workspaceSrc.indexOf("const SECTIONS = ["),
  workspaceSrc.indexOf("];", workspaceSrc.indexOf("const SECTIONS = ["))
);
check(
  "事项区块顺序是即将截止在前",
  sectionsBlock.indexOf('key: "soon"') < sectionsBlock.indexOf('key: "todo"'),
  true
);
check(
  "待确认事项排到最后",
  sectionsBlock.indexOf('key: "todo"') < sectionsBlock.indexOf('key: "pending"'),
  true
);
check(
  "提醒区挪到统计卡之后",
  workspaceSrc.indexOf("/* 提醒区") > workspaceSrc.indexOf("/* 统计卡"),
  true
);
check(
  "统计卡在三个事项区块之前",
  workspaceSrc.indexOf("/* 统计卡") < workspaceSrc.indexOf("/* 三个区块"),
  true
);
check("统计卡自身顺序未动", workspaceSrc.indexOf('{ key: "pending", label: "待确认"') < workspaceSrc.indexOf('{ key: "soon", label: "即将截止"'), true);
check("宽屏容器收住横向溢出", workspaceSrc.includes("overflow-x-hidden"), true);
check("宽屏留白用间距收口", workspaceSrc.includes("sm:px-6"), true);
check("统计卡栅格间距调过", workspaceSrc.includes("sm:grid-cols-3 sm:gap-5"), true);
check("事项栅格间距调过", workspaceSrc.includes("md:grid-cols-2 md:gap-5 xl:grid-cols-3"), true);
check("空态分支仍在", workspaceSrc.includes("还没有通知"), true);
check("ItemCard 接线没被删", workspaceSrc.includes("<ItemCard"), true);

check(
  "聚合卡写出有 N 项活动的提示",
  scheduleAlertsSrc.includes("项活动未提供结束时间，暂无法判断时间冲突。"),
  true
);
check("聚合卡数字取去重后的事项数", scheduleAlertsSrc.includes("pendingItems.length"), true);
check("聚合卡默认折叠", scheduleAlertsSrc.includes("useState(false)"), true);
check("聚合卡展开按钮写查看具体事项", scheduleAlertsSrc.includes("查看具体事项"), true);
check("聚合卡能收起", scheduleAlertsSrc.includes("收起"), true);
check(
  "遍历提醒时过滤掉缺结束时间那一类",
  scheduleAlertsSrc.includes('alert && alert.type !== "needEndTime"'),
  true
);
check("补时间按当前事项定位", scheduleAlertsSrc.includes("handleConfirm(ik, item)"), true);
check("输入值按事项单独记", scheduleAlertsSrc.includes("itemDraftKey(item)"), true);
check("聚合按事项去重", scheduleAlertsSrc.includes("seen.has(k)"), true);
check("没有缺结束时间时不渲染聚合卡", scheduleAlertsSrc.includes("showEndTimeCard ? ("), true);
check("旧的单条展开状态已清掉", scheduleAlertsSrc.includes("toggleExpand"), false);
check("旧的单条补时间入口已清掉", scheduleAlertsSrc.includes("showFillEntry"), false);
check("旧集合状态已清掉", scheduleAlertsSrc.includes("setExpanded"), false);
check("聚合卡不加完成或禁用入口", scheduleAlertsSrc.includes("标记完成"), false);
check("时间冲突类提醒配置仍在", scheduleAlertsSrc.includes("时间冲突"), true);
check("截止事项集中类提醒配置仍在", scheduleAlertsSrc.includes("截止事项集中"), true);

// ---------- 七、冲突判定两个边界（纯函数，不能被本轮改坏） ----------
function ev(noticeId, itemIndex, name, time, endTime) {
  return {
    noticeId,
    itemIndex,
    name,
    time,
    endTime,
    timeType: "start",
    date: new Date(2026, 10, 14),
    ts: new Date(2026, 10, 14, 14, 0).getTime(),
    noticeTitle: "通知" + noticeId,
    progress: "待办理",
  };
}
const E1 = buildScheduleAlerts([
  ev("a", 0, "讲座", "14:00", "16:00"),
  ev("b", 0, "评审会", "15:00", "17:00"),
]);
const E2 = buildScheduleAlerts([
  ev("a", 0, "讲座", "14:00", "15:00"),
  ev("b", 0, "评审会", "15:00", "16:00"),
]);
check("确实重叠报一条时间冲突", E1.length, 1);
check("确实重叠的类型是 overlap", E1[0] && E1[0].type, "overlap");
check("前一项结束恰好等于后一项开始不报冲突", E2.length, 0);
const threeNeed = buildScheduleAlerts([
  ev("a", 0, "讲座", "14:30", ""),
  ev("b", 0, "评审会", "15:00", ""),
  ev("c", 0, "班会", "16:00", ""),
]);
check("纯函数仍给三条缺结束时间各一条提醒，聚合只在展示层", threeNeed.length, 3);
check(
  "展示层把三条收成一张卡",
  scheduleAlertsSrc.includes("const showEndTimeCard = pendingItems.length > 0;"),
  true
);

// ---------- 八、107 实测抓到的两处缺陷，钉死接线不许再退化 ----------
// 明确另存曾因异步 state 在同一渲染里仍是 false 而反复弹窗，
// 现在必须走同步的具名放行标记，且普通按钮回调不能误判成放行。
check(
  "明确另存调用同步放行标记",
  pageSrc.includes("handleParse({ forceImport: true })"),
  true
);
check(
  "放行标记只认具名对象，不认事件对象",
  pageSrc.includes("opts && opts.forceImport === true"),
  true
);
check(
  "查重条件读布尔变量而不是可能为空的参数",
  pageSrc.includes("!allowDuplicate && !forceImport"),
  true
);
check(
  "源码里不再直接解引用可能为空的 opts",
  pageSrc.includes("!opts.forceImport"),
  false
);
// 变更对比弹窗曾在 onClick 里引用没解构出来的回调，点击就抛异常。
check(
  "变更对比弹窗接收原文定位回调",
  patchReviewSrc.includes("  onFieldClick,"),
  true
);
check(
  "页面确实把原文定位回调传给变更对比弹窗",
  pageSrc.includes("onFieldClick={(span) => handleHighlightSpan(span)}"),
  true
);

// ---------- 金丝雀：故意写错，必须报差异 ----------
let canary = 0;
let canaryFail = 0;
function canaryCheck(name, actual, wrongExpected) {
  const a = Array.isArray(actual) ? JSON.stringify(actual) : actual;
  const e = Array.isArray(wrongExpected) ? JSON.stringify(wrongExpected) : wrongExpected;
  canary++;
  if (a !== e) canaryFail++;
}

canaryCheck("金丝雀 把 A1 事项名写成绝不会出现的串", nA1.items[0].name, "绝不存在的第七轮占位串");
canaryCheck("金丝雀 断言源码里绝不存在的占位串", pageSrc.includes("绝不存在的第七轮占位串"), true);

// ---------- 输出 ----------
console.log("第七轮自检回归（日期时间、事项命名、时间类型、重复分级、工作台）");
console.log("");
if (failures.length > 0) {
  console.log("失败明细：");
  failures.forEach((f) => console.log(f));
  console.log("");
}
console.log("业务结果：" + pass + " 通过 / " + fail + " 失败 / 共 " + (pass + fail) + " 条");
console.log(
  "金丝雀：" + canaryFail + " / " + canary + " 条按预期报差异（说明断言真的会响）"
);
if (fail === 0 && canaryFail === canary) {
  console.log("全部通过");
} else {
  process.exitCode = 1;
}
