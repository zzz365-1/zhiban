/**
 * 第四轮自检回归：第六轮实测里修掉的五个抽取缺陷。
 *
 * 用法：node scripts/test-round4.mjs
 *
 * 全部 import 生产模块。断言前不做归一化。
 * 末尾两条金丝雀用来证明这套断言真的会报红。
 *
 * 覆盖的缺陷与对应提示词：
 *   069 逾期不再受理被当成要带的材料
 *   070 补充通知里调整后的日期抽不出来
 *   071 改期后时间仍取到作废的那个
 *   072 讲座这类别的通知整条拆不出事项
 *   073 一行写一个字段的写法整条仍然零事项
 */

import { extractNotice } from "../app/lib/extractNotice.js";
import { buildItems } from "../app/lib/noticeItems.js";

const TODAY = "2026-11-02";

// ---------- 一、材料噪声拦截（069） ----------

const M_NOISE =
  "关于研究生奖学金材料报送的通知\n" +
  "请于12月12日16:30前将成绩单和获奖证书复印件交至研究生院302室，逾期不再受理。";

const M_KEEP1 = "请携带毛巾和一支黑色笔到体育馆。";
const M_KEEP2 = "请提交体温监测表和身份证复印件。";
const M_KEEP3 = "需准备一寸照片两张。";

// ---------- 二、改期后的日期（070） ----------

const R_GRADE =
  "关于助学金评审会的补充通知\n" +
  "原定11月8日的助学金评审会调整至11月9日19:00，地点改为行政楼B201会议室，其余安排不变。";

const R_OPEN =
  "关于冬季运动会开幕式的补充通知\n" +
  "原定11月22日8:30的开幕式调整至11月23日9:00，地点改为体育馆主馆，其余安排不变。";

const R_POSTPONE = "报名延期至11月30日17:00，其余要求不变。";
const R_PUSH = "会议推迟到12月1日召开。";

// 防误杀：不带改期词的普通通知，日期时间必须原样。
const R_PLAIN = "请各班于12月12日16:30前将成绩单交至研究生院302室。";
const R_OLD_ONLY = "原定11月8日召开评审会，请于11月5日前交表。";

// ---------- 三、零事项兜底（072 / 073） ----------

const Z_LECTURE =
  "学术讲座通知\n时间，11月6日19:00\n地点，图书馆三楼报告厅\n欢迎广大师生参加。";

const Z_LECTURE_NODATE = "讲座时间另行通知，地点在文科楼报告厅。";

const Z_REMAKE =
  "关于补办学生证的通知\n" +
  "每周三下午2点到5点在卡务中心办理，需携带身份证复印件和一寸照片。";

// 纯告知负例：一条都不许造出事项。
const N_HONOR = "我校李明老师荣获2026年度全国优秀教师称号，特此通报。";
const N_ONLINE = "图书馆新系统已于11月1日上线运行，欢迎使用。";
const N_HOLIDAY = "关于2026年寒假放假安排的通知，放假时间为1月20日至2月25日。";

// ---------- 五、用未参与开发的新通知做交叉检查 ----------
// 这四条是第六轮收尾时才写的，不在评测语料里，也不在演示素材里。

const X_LECTURE =
  "关于举办人工智能前沿讲座的通知\n主题，大模型与产业应用\n时间，11月12日19点00\n" +
  "地点，图书馆三楼报告厅\n主讲人，计算机学院张教授\n欢迎全校师生参加。";

const X_RESCHEDULE =
  "关于2026年秋季校园招聘会双选会的补充通知\n" +
  "原定11月15日9点00的双选会调整至11月18日14点30，地点改为体育馆主馆，其余安排不变。";

const X_CHECKUP =
  "关于开展2026级新生体检的通知\n" +
  "请于11月20日8点00前到校医院一层大厅集合，携带身份证和一寸照片，逾期不再受理。";

const X_HONOR_NEW = "我校王芳老师荣获2026年度校级教学能手称号，特此通报。";

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

function mats(text) {
  return extractNotice(text).materials || [];
}

function first(text) {
  const items = buildItems(text, { publishedAt: TODAY });
  return items.length > 0 ? items[0] : null;
}

// ---------- 一、材料噪声 ----------

check(
  "逾期不再受理不再进材料",
  mats(M_NOISE).includes("逾期不再受理"),
  false
);
check(
  "成绩单与获奖证书复印件仍在",
  mats(M_NOISE).includes("成绩单") && mats(M_NOISE).includes("获奖证书复印件"),
  true
);
check("真材料 毛巾与黑色笔", mats(M_KEEP1), ["毛巾", "黑色笔"]);
check("真材料 体温监测表与身份证复印件", mats(M_KEEP2), [
  "体温监测表",
  "身份证复印件",
]);
check("真材料 一寸照片", mats(M_KEEP3), ["准备一寸照片"]);

// ---------- 二、改期日期与时间 ----------

{
  const r = extractNotice(R_GRADE);
  // 分别断言，不用 deadline || eventDate。
  // 真实踩过坑：写成或的形式时，注入掉改期日期优先那条路径，
  // eventDate 仍会拿到同一个日期，断言照样通过，防线等于没响。
  check("评审会改期 截止日期取调整后的11月9日", r.deadline, "11月9日");
  check("评审会改期 同一天不再重复造活动日", r.eventDate, null);
  check("评审会改期 时间19点00", r.time, "19:00");
  check("评审会改期 活动时间不串到截止时间格", r.eventTime, null);
}

{
  const r = extractNotice(R_OPEN);
  check("开幕式改期 截止日期取调整后的11月23日", r.deadline, "11月23日");
  check("开幕式改期 同一天不再重复造活动日", r.eventDate, null);
  // 这一条是 071 的重点：原定 8点30 已经作废，必须给 9点00。
  check("开幕式改期 时间必须给9点00不是8点30", r.time, "09:00");
  check("开幕式改期 活动时间不串到截止时间格", r.eventTime, null);
}

{
  const r = extractNotice(R_POSTPONE);
  check("延期至 11月30日", r.deadline, "11月30日");
  check("延期至 时间17点00", r.time, "17:00");
}

{
  const r = extractNotice(R_PUSH);
  check("推迟到 12月1日", r.deadline, "12月1日");
}

// 防误杀：没有改期词的通知不能因为这次改动走样。
{
  const r = extractNotice(R_PLAIN);
  check("普通通知 日期不受影响", r.deadline, "12月12日");
  check("普通通知 时间不受影响", r.time, "16:30");
}

{
  const r = extractNotice(R_OLD_ONLY);
  check("原定无改期词 截止仍是11月5日", r.deadline, "11月5日");
  check("原定无改期词 活动日仍是11月8日", r.eventDate, "11月8日");
}

// ---------- 三、零事项兜底 ----------

{
  const it = first(Z_LECTURE);
  check("标签式讲座 造出事项", it !== null, true);
  check("标签式讲座 日期", it ? it.date : null, "11月6日");
  check("标签式讲座 时间", it ? it.time : null, "19:00");
  check("标签式讲座 地点", it ? it.location : null, "图书馆三楼报告厅");
}

{
  const it = first(Z_LECTURE_NODATE);
  check("无日期讲座 造出事项", it !== null, true);
  check("无日期讲座 地点", it ? it.location : null, "文科楼报告厅");
  check("无日期讲座 日期留空", it ? it.date : "x", null);
}

{
  const it = first(Z_REMAKE);
  check("补办学生证 造出事项", it !== null, true);
  check("补办学生证 时间", it ? it.time : null, "14:00");
  check("补办学生证 地点", it ? it.location : null, "卡务中心");
  check(
    "补办学生证 材料两件",
    it ? (it.materials || []).map((m) => m.name) : [],
    ["身份证复印件", "一寸照片"]
  );
}

// ---------- 五、新通知交叉检查 ----------

{
  const it = first(X_LECTURE);
  check("新通知 标签式讲座 造出事项", it !== null, true);
  check("新通知 标签式讲座 日期", it ? it.date : null, "11月12日");
  check("新通知 标签式讲座 时间", it ? it.time : null, "19:00");
  check("新通知 标签式讲座 地点", it ? it.location : null, "图书馆三楼报告厅");
}

{
  const it = first(X_RESCHEDULE);
  check("新通知 双选会改期 造出事项", it !== null, true);
  check("新通知 双选会改期 日期取11月18日", it ? it.date : null, "11月18日");
  check("新通知 双选会改期 时间取14点30不是9点00", it ? it.time : null, "14:30");
  // 地点不能再挂着改为两个字。
  check("新通知 双选会改期 地点不带改为前缀", it ? it.location : null, "体育馆主馆");
}

{
  const it = first(X_CHECKUP);
  check("新通知 体检 造出事项", it !== null, true);
  check("新通知 体检 日期", it ? it.date : null, "11月20日");
  check("新通知 体检 时间", it ? it.time : null, "08:00");
  check("新通知 体检 地点", it ? it.location : null, "校医院一层大厅");
  // 逾期不再受理不能进材料。真材料这一格另有遗留，见文档。
  check(
    "新通知 体检 逾期不再受理不进材料",
    (it ? (it.materials || []).map((m) => m.name) : []).includes("逾期不再受理"),
    false
  );
}

check(
  "新通知 表彰通报仍零事项",
  buildItems(X_HONOR_NEW, { publishedAt: TODAY }).length,
  0
);

// ---------- 四、纯告知负例必须继续零事项 ----------

check(
  "纯告知 表彰通报仍零事项",
  buildItems(N_HONOR, { publishedAt: TODAY }).length,
  0
);
check(
  "纯告知 系统上线仍零事项",
  buildItems(N_ONLINE, { publishedAt: TODAY }).length,
  0
);
check(
  "纯告知 放假安排仍零事项",
  buildItems(N_HOLIDAY, { publishedAt: TODAY }).length,
  0
);

// ---------- 金丝雀：故意写错，必须报红 ----------

let canary = 0;
let canaryFail = 0;

function canaryCheck(name, actual, wrongExpected) {
  const a = Array.isArray(actual) ? JSON.stringify(actual) : actual;
  const e = Array.isArray(wrongExpected) ? JSON.stringify(wrongExpected) : wrongExpected;
  canary++;
  if (a !== e) canaryFail++;
}

canaryCheck(
  "金丝雀 逾期不再受理仍被当材料",
  mats(M_NOISE).includes("逾期不再受理"),
  true
);
canaryCheck(
  "金丝雀 纯告知名义写成有事项",
  buildItems(N_HONOR, { publishedAt: TODAY }).length,
  1
);

// ---------- 输出 ----------

console.log("第四轮自检回归（第六轮实测修掉的五个抽取缺陷）");
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
