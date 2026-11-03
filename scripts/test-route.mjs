import { buildItems } from "../app/lib/noticeItems.js";
import { buildRouteEvents } from "../app/lib/routeEvents.js";
import { getTodoItems } from "../app/lib/todo.js";

let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) pass++;
  else fail++;
  console.log(
    (ok ? "PASS" : "FAIL") + " - " + name +
      "\n    期望 " + JSON.stringify(expected) +
      "\n    实际 " + JSON.stringify(actual)
  );
}

const CASE1 =
  "关于2026年国家助学金评审工作安排的通知\n" +
  "各班请于11月5日下午5点前将纸质申请表报送至学生工作处A302办公室。\n" +
  "评审会定于11月8日晚7点在行政楼A302会议室召开，请各班班长届时到场。";
const CASE4 =
  "关于紧急报送体温监测表的通知\n" +
  "请各班于明天下午5点前将体温监测表交至学院学工办B203。";

function notice(text, items) {
  return { id: "n1", title: "助学金", text, items, deadlineDate: null };
}

// 1 两个事项摊出两个事件
const items1 = buildItems(CASE1);
const ev1 = buildRouteEvents([notice(CASE1, items1)]);
check("两个事项摊成两个事件", ev1.length, 2);
check(
  "第一个事件名称地点时间类型",
  [ev1[0].name, ev1[0].location, ev1[0].timeType, ev1[0].time],
  ["提交纸质申请表", "学生工作处A302办公室", "deadline", "17:00"]
);
check(
  "第二个事件名称地点时间类型",
  [ev1[1].name, ev1[1].location, ev1[1].timeType, ev1[1].time],
  ["参加评审会", "行政楼A302会议室", "start", "19:00"]
);
check("事件带通知标题", ev1[0].noticeTitle, "助学金");
check("事件带事项序号", [ev1[0].itemIndex, ev1[1].itemIndex], [0, 1]);

// 2 标完成之后状态跟着变，且不消失
const doneItems = items1.map((it, i) =>
  i === 0 ? { ...it, progress: "已办理" } : it
);
const ev2 = buildRouteEvents([notice(CASE1, doneItems)]);
check("标完成后事件还在", ev2.length, 2);
check("标完成后状态是已办理", ev2[0].progress, "已办理");
check("另一个仍是待办理", ev2[1].progress, "待办理");

// 3 改日期后日历跟着变
const movedItems = items1.map((it, i) =>
  i === 1 ? { ...it, date: "11月9日" } : it
);
const ev3 = buildRouteEvents([notice(CASE1, movedItems)]);
check(
  "改日期后第二个事件日期跟着变",
  new Date(ev3[1].ts).getDate(),
  9
);
check("改日期不影响第一个", new Date(ev3[0].ts).getDate(), 5);

// 4 日期算不出来不硬塞
const ev4 = buildRouteEvents([notice(CASE4, buildItems(CASE4))]);
check("日期算不出来摊出零个", ev4.length, 0);

// 5 老数据退回整条通知的截止时间
const old = { id: "n2", title: "老通知", deadlineDate: new Date(2026, 10, 7, 9, 0).getTime() };
const ev5 = buildRouteEvents([old]);
check("老数据摊出一个", ev5.length, 1);
check("老数据标题用通知标题", ev5[0].name, "老通知");
check("老数据材料是空数组", ev5[0].materials, []);
check("老数据状态是待办理", ev5[0].progress, "待办理");

// 6 待办按事项筛，已办理不进
// 两个事项分别是 11月5日 和 11月8日，相隔三天。
// 基准取 11月5日 中午，三天窗口正好能同时框住这两天，
// 这样才验得到「两个事项都进待办」和「标完成的那个不进」。
const nowTs = new Date(2026, 10, 5, 12, 0).getTime();
const todo1 = getTodoItems(buildRouteEvents([notice(CASE1, items1)]), nowTs);
check("两天内两个事项都进待办", todo1.map((e) => e.name), [
  "提交纸质申请表",
  "参加评审会",
]);
const todo2 = getTodoItems(buildRouteEvents([notice(CASE1, doneItems)]), nowTs);
check("标完成的不进待办", todo2.map((e) => e.name), ["参加评审会"]);
const todo3 = getTodoItems(
  buildRouteEvents([
    notice(CASE1, items1.map((it) => ({ ...it, progress: "无需办理" }))),
  ]),
  nowTs
);
check("无需办理的不进待办", todo3.length, 0);

// 7 事项存两处的坑：外层 items 是旧值，analysis.items 才是界面改过的
// 界面点完成改的是 analysis.items，摊平必须认这一份，否则日历不跟着变
const twoCopies = {
  id: "n3",
  title: "助学金",
  items: items1,
  analysis: { items: doneItems },
  deadlineDate: null,
};
check(
  "两份事项不一致时以分析结果那份为准",
  buildRouteEvents([twoCopies]).map((e) => e.progress),
  ["已办理", "待办理"]
);
check(
  "只有外层事项时也能摊出来",
  buildRouteEvents([{ id: "n4", title: "助学金", items: items1 }]).length,
  2
);

console.log("");
console.log("业务结果：" + pass + " 通过 / " + fail + " 失败 / 共 " + (pass + fail) + " 条");
if (fail > 0) process.exitCode = 1;
