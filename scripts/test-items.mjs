/**
 * 事项层测试。
 *
 * 四个案例是同学第一轮点名要求跑通的，全部锁死在这里。
 * 另外盯住三件事：原文依据能不能反查到下午5点，状态有没有区分开，
 * 老数据迁移有没有把原有字段弄丢。
 */

import { buildItems, applyItemPatch } from "../app/lib/noticeItems.js";
import { migrateNotice, migrateNotices } from "../app/lib/noticeMigrate.js";
import { checkDuplicate, dedupeItems } from "../app/lib/dedupe.js";
import { extractNotice } from "../app/lib/extractNotice.js";
import { parseOne } from "../app/lib/parseOne.js";

const CASE1 =
  "关于2026年国家助学金评审工作安排的通知\n" +
  "各班请于11月5日下午5点前将纸质申请表报送至学生工作处A302办公室。\n" +
  "评审会定于11月8日晚7点在行政楼A302会议室召开，请各班班长届时到场。";

const CASE2 =
  "第十五届校园歌手大赛报名通知\n" +
  "报名截止时间为11月10日17:00，报名表交到团委办公室。\n" +
  "初赛定于11月15日晚6点半在大礼堂举行，请参赛选手提前半小时到场签到。";

const CASE3 =
  "关于冬季学生宿舍安全卫生检查的通知\n" +
  "11月20日上午9点起，后勤管理处将对全校学生宿舍进行检查，请各寝室配合。";

const CASE4 =
  "关于紧急报送体温监测表的通知\n" +
  "请各班于明天下午5点前将体温监测表交至学院学工办B203。";

const CASE_RESUME =
  "就业指导讲座通知\n" +
  "讲座定于11月14日下午两点半在图南楼报告厅举办，讲座介绍简历制作与面试技巧，欢迎参加。";

function itemsOf(text, opts) {
  return buildItems(text, opts || {});
}

function brief(item) {
  return [
    item.name,
    item.timeType,
    item.date,
    item.time || "-",
    item.location || "-",
    (item.materials || []).join("+") || "-",
  ].join("|");
}

const CASES = [
  // ---------- 案例1 ----------
  {
    name: "案例1 切成两个事项",
    actual: () => itemsOf(CASE1).length,
    expected: 2,
  },
  {
    name: "案例1 事项一 提交纸质申请表 截止11月5日17点 学生工作处A302办公室",
    actual: () => brief(itemsOf(CASE1)[0]),
    expected: "提交纸质申请表|deadline|11月5日|17:00|学生工作处A302办公室|纸质申请表",
  },
  {
    name: "案例1 事项二 参加评审会 开始11月8日19点 行政楼A302会议室",
    actual: () => brief(itemsOf(CASE1)[1]),
    expected: "参加评审会|start|11月8日|19:00|行政楼A302会议室|-",
  },
  {
    name: "案例1 两个事项各自带自己的地点，没有串",
    actual: () => {
      const it = itemsOf(CASE1);
      return it[0].location !== it[1].location;
    },
    expected: true,
  },
  {
    name: "案例1 评审会那一条不要求交材料，标不适用",
    actual: () => itemsOf(CASE1)[1].status.materials,
    expected: "not_applicable",
  },

  // ---------- 案例2 ----------
  {
    name: "案例2 切成两个事项",
    actual: () => itemsOf(CASE2).length,
    expected: 2,
  },
  {
    name: "案例2 事项一 提交报名表 截止11月10日17点 团委办公室",
    actual: () => brief(itemsOf(CASE2)[0]),
    expected: "提交报名表|deadline|11月10日|17:00|团委办公室|报名表",
  },
  {
    name: "案例2 初赛开始11月15日18:30 大礼堂",
    actual: () => brief(itemsOf(CASE2)[1]),
    expected: "参加初赛|start|11月15日|18:30|大礼堂|-",
  },
  {
    name: "案例2 提前半小时签到不能覆盖初赛开始时间",
    actual: () => itemsOf(CASE2)[1].time,
    expected: "18:30",
  },

  // ---------- 案例3 ----------
  {
    name: "案例3 只有一个事项",
    actual: () => itemsOf(CASE3).length,
    expected: 1,
  },
  {
    name: "案例3 是开始时间不是办理截止",
    actual: () => itemsOf(CASE3)[0].timeType,
    expected: "start",
  },
  {
    name: "案例3 时间11月20日09:00",
    actual: () => {
      const it = itemsOf(CASE3)[0];
      return it.date + " " + it.time;
    },
    expected: "11月20日 09:00",
  },

  // ---------- 案例4 ----------
  {
    name: "案例4 材料是体温监测表",
    actual: () => (itemsOf(CASE4)[0].materials || []).join(""),
    expected: "体温监测表",
  },
  {
    name: "案例4 地点是学院学工办B203",
    actual: () => itemsOf(CASE4)[0].location,
    expected: "学院学工办B203",
  },
  {
    name: "案例4 没有发布日期时明天不换算，标待确认",
    actual: () => {
      const it = itemsOf(CASE4)[0];
      return it.date + "|" + it.status.date;
    },
    expected: "明天|pending",
  },
  {
    name: "案例4 给了发布日期明天按发布日期换算",
    actual: () => {
      const it = itemsOf(CASE4, { publishedAt: new Date("2026-11-02T09:00:00") })[0];
      return it.date + "|" + it.status.date;
    },
    expected: "2026年11月3日|ok",
  },

  {
    name: "整条解析链路没给发布日期时也不按今天换算",
    actual: async () => {
      const r = await parseOne(CASE4, {});
      return String(r.analysis._datePending) + "|" + r.analysis.deadline;
    },
    expected: "true|明天",
  },
  {
    name: "整条解析链路给了发布日期就按它换算",
    actual: async () => {
      const r = await parseOne(CASE4, {
        publishedAt: new Date("2026-11-02T09:00:00"),
      });
      return String(r.analysis._datePending) + "|" + r.analysis.deadline;
    },
    expected: "false|2026年11月3日",
  },

  // ---------- 误提防线 ----------
  {
    name: "讲座介绍简历制作不能提取成要交简历",
    actual: () => JSON.stringify(extractNotice(CASE_RESUME).materials),
    expected: "[]",
  },
  {
    name: "报告会里的报告不是要交的材料，学生证才是",
    actual: () => {
      const m = extractNotice(
        "学术报告会将于11月10日举行，请携带学生证。"
      ).materials;
      return JSON.stringify(m);
    },
    expected: JSON.stringify(["学生证"]),
  },
  {
    name: "真的要交简历时还得能抽到",
    actual: () => {
      const m = extractNotice("请于11月9日前将简历交至就业指导中心。").materials;
      return m.indexOf("简历") !== -1;
    },
    expected: true,
  },
  {
    name: "分类不能因为出现行政楼就判成行政",
    actual: () =>
      extractNotice("请各班班长11月8日晚7点到行政楼A302会议室。").category,
    expected: null,
  },
  {
    name: "会议室里的会议也不能当成行政类的证据",
    actual: () =>
      extractNotice("11月8日晚7点在第三会议室集合。").category,
    expected: null,
  },

  // ---------- 原文依据 ----------
  {
    name: "展示值17:00能定位到原文的下午5点",
    actual: () => {
      const it = itemsOf(CASE1)[0];
      const f = it.evidence.fields.time;
      return f ? f.quote : "无";
    },
    expected: "下午5点",
  },
  {
    name: "展示值19:00能定位到原文的晚7点",
    actual: () => {
      const it = itemsOf(CASE1)[1];
      const f = it.evidence.fields.time;
      return f ? f.quote : "无";
    },
    expected: "晚7点",
  },
  {
    name: "展示值18:30能定位到原文的晚6点半",
    actual: () => {
      const it = itemsOf(CASE2)[1];
      const f = it.evidence.fields.time;
      return f ? f.quote : "无";
    },
    expected: "晚6点半",
  },
  {
    name: "依据的偏移量切出来的字就是引用本身",
    actual: () => {
      const it = itemsOf(CASE1)[0];
      const f = it.evidence.fields.location;
      return CASE1.slice(f.start, f.end) === f.quote;
    },
    expected: true,
  },
  {
    name: "时间的偏移量切出来的字就是引用本身",
    actual: () => {
      const it = itemsOf(CASE1)[0];
      const f = it.evidence.fields.time;
      return CASE1.slice(f.start, f.end) === f.quote;
    },
    expected: true,
  },

  // ---------- 状态区分 ----------
  {
    name: "状态至少有原文未提及和待确认两种，不能全是未识别",
    actual: () => {
      const a = itemsOf(CASE4)[0];
      const b = itemsOf(CASE1)[1];
      return [a.status.date, b.status.materials].join(",");
    },
    expected: "pending,not_applicable",
  },
  {
    name: "活动事项没有地点时标原文未提及",
    actual: () => itemsOf(CASE3)[0].status.location,
    expected: "not_mentioned",
  },

  // ---------- 手动改字段同步 ----------
  {
    name: "手动改截止日期后事项跟着改",
    actual: () => {
      const list = itemsOf(CASE1);
      const patched = applyItemPatch(list, { deadline: "2026年11月6日" });
      return patched[0].date;
    },
    expected: "2026年11月6日",
  },
  {
    name: "手动改的值不因为原文找不到就判存疑",
    actual: () => {
      const list = itemsOf(CASE1);
      const patched = applyItemPatch(list, { deadline: "2026年11月6日" });
      return patched[0].status.date;
    },
    expected: "ok",
  },

  // ---------- 老数据迁移 ----------
  {
    name: "迁移补出事项",
    actual: () => {
      const old = {
        id: "n_old",
        title: "老通知",
        source: "本地识别",
        text: CASE1,
        analysis: { deadline: "11月5日", time: "17:00" },
        deadlineDate: 1,
      };
      const n = migrateNotice(old);
      return n.items.length;
    },
    expected: 2,
  },
  {
    name: "迁移不丢原有字段",
    actual: () => {
      const old = {
        id: "n_old",
        title: "老通知",
        source: "本地识别",
        text: CASE1,
        analysis: { deadline: "11月5日", time: "17:00" },
        deadlineDate: 1,
      };
      const n = migrateNotice(old);
      return [n.id, n.title, n.source, n.deadlineDate, n.analysis.deadline].join("|");
    },
    expected: "n_old|老通知|本地识别|1|11月5日",
  },
  {
    name: "已经是新结构的不要重复迁移",
    actual: () => {
      const n = { id: "x", schemaVersion: 2, items: [{ name: "a" }], text: CASE1 };
      return migrateNotice(n).items.length;
    },
    expected: 1,
  },
  {
    name: "整表迁移保留条数",
    actual: () => migrateNotices([{ text: CASE1 }, { text: CASE3 }]).length,
    expected: 2,
  },

  // ---------- 重复导入 ----------
  {
    name: "正文完全一致判为完全重复",
    actual: () =>
      checkDuplicate(CASE1, [{ id: "a", text: CASE1, title: "助学金" }]).type,
    expected: "exact",
  },
  {
    name: "标题相同正文不同判为标题重复",
    actual: () =>
      checkDuplicate(CASE1, [
        { id: "a", text: CASE1.split(String.fromCharCode(10))[0] + "\n内容不一样。", title: "助学金" },
      ]).type,
    expected: "title_same",
  },
  {
    name: "完全无关的通知不报重复",
    actual: () =>
      checkDuplicate(CASE1, [{ id: "a", text: "关于运动会的通知\n11月1日开会。", title: "运动会" }])
        .type,
    expected: "none",
  },
  {
    name: "同一事项在日历里只留一个",
    actual: () => {
      const list = itemsOf(CASE1);
      const dup = list.concat(list.map((x) => ({ ...x })));
      return dedupeItems(dup).length;
    },
    expected: 2,
  },
];

function runCanary() {
  // 故意给一个错的值，断言必须报红。
  // 注入验证靠它证明这套断言不是摆设。
  const it = itemsOf(CASE1)[0];
  return it.time === "00:00";
}

function eq(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

let pass = 0;
let fail = 0;

console.log("事项层测试");
console.log("");

for (let i = 0; i < CASES.length; i++) {
  const c = CASES[i];
  let actual;
  try {
    // 有的用例要调解析链路，是异步的，这里得等它
    actual = await c.actual();
  } catch (e) {
    actual = "抛异常：" + String(e && e.message ? e.message : e);
  }
  const ok = eq(actual, c.expected);

  if (ok) pass++;
  else fail++;

  console.log(
    "[" + (i + 1) + "/" + CASES.length + "] " + (ok ? "PASS" : "FAIL") + " - " + c.name
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
    (canaryOk ? "异常 PASS（断言逻辑已坏）" : "按预期 FAIL（断言逻辑正常）")
);

if (fail > 0 || canaryOk) {
  process.exitCode = 1;
}
