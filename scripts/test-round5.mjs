/**
 * 第五轮自检回归：2026-11-04 新增「通知发布日期」入口。
 *
 * 用法：node scripts/test-round5.mjs
 *
 * 动态断言全部 import 生产模块，断言前不做归一化。
 * 静态断言读页面与弹窗源码，钉住「把基准传下去」这条接线，
 * 防止以后有人只改了库函数却忘了页面。
 * 全程零网络零密钥，parseOne 只测有基准的本地规则路径。
 * 末尾两条金丝雀用来证明这套断言真的会报红。
 */

import { readFileSync } from "node:fs";
import { buildItems } from "../app/lib/noticeItems.js";
import { parseOne } from "../app/lib/parseOne.js";
import { migrateNotice } from "../app/lib/noticeMigrate.js";
import { isFuzzyDate } from "../app/lib/aiExtract.js";

const BASE = { publishedAt: "2026-11-03" };
const NONE = { publishedAt: "" };

const T_NEXTWEEK =
  "关于开展宿舍安全月活动的通知\n" +
  "请各班于下周三下午4点前将活动计划表交至学院学工办A201。";

const T_TOMORROW =
  "关于紧急报送体温监测表的通知\n" +
  "请各班于明天下午5点前将体温监测表交至学院学工办B203。";

const T_EXACT =
  "关于2026年国家助学金评审工作安排的通知\n" +
  "各班请于11月5日下午5点前将纸质申请表报送至学生工作处A302办公室。";

const N_HONOR = "我校王芳老师荣获2026年度校级教学能手称号，特此通报。";
const N_ONLINE = "图书馆新系统已于11月1日上线运行，欢迎使用。";
const N_HOLIDAY =
  "关于2026年寒假放假安排的通知，放假时间为1月20日至2月25日。";

const pageSrc = readFileSync(
  new URL("../app/page.js", import.meta.url),
  "utf8"
);
const dialogSrc = readFileSync(
  new URL("../app/components/NewNoticeDialog.js", import.meta.url),
  "utf8"
);
const migrateSrc = readFileSync(
  new URL("../app/lib/noticeMigrate.js", import.meta.url),
  "utf8"
);
const panelSrc = readFileSync(
  new URL("../app/components/AnalysisPanel.js", import.meta.url),
  "utf8"
);

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

function firstDate(text, opts) {
  const items = buildItems(text, opts);
  return items.length > 0 ? items[0].date : null;
}

function firstStatus(text, opts) {
  const items = buildItems(text, opts);
  return items.length > 0 ? items[0].dateStatus : null;
}

// ---------- 一、留空基准必须原样待确认，不许拿今天偷偷换算 ----------

check("R1 下周三 留空基准 保留原文词", firstDate(T_NEXTWEEK, NONE), "下周三");
check("R1 下周三 留空基准 状态待确认", firstStatus(T_NEXTWEEK, NONE), "pending");
check("R1 明天 留空基准 保留原文词", firstDate(T_TOMORROW, NONE), "明天");
check("R1 明天 留空基准 状态待确认", firstStatus(T_TOMORROW, NONE), "pending");

// ---------- 二、填了基准就要换算成具体日期 ----------

check(
  "R2 下周三 填 2026年11月3日 换算成 2026年11月11日",
  firstDate(T_NEXTWEEK, BASE),
  "2026年11月11日"
);
check("R2 下周三 填基准后状态正常", firstStatus(T_NEXTWEEK, BASE), "ok");
check("R2 下周三 时间仍是 16点00", buildItems(T_NEXTWEEK, BASE)[0].time, "16:00");
check(
  "R3 明天 填 2026年11月3日 换算成 2026年11月4日",
  firstDate(T_TOMORROW, BASE),
  "2026年11月4日"
);
check("R3 明天 填基准后状态正常", firstStatus(T_TOMORROW, BASE), "ok");
check("R3 明天 时间仍是 17点00", buildItems(T_TOMORROW, BASE)[0].time, "17:00");

// ---------- 三、明确日期的通知填不填都一样，不被基准改写 ----------

check("R4 明确日期 留空基准", firstDate(T_EXACT, NONE), "11月5日");
check("R4 明确日期 填基准", firstDate(T_EXACT, BASE), "11月5日");
check("R4 明确日期 时间留空", buildItems(T_EXACT, NONE)[0].time, "17:00");
check("R4 明确日期 时间填基准", buildItems(T_EXACT, BASE)[0].time, "17:00");

// ---------- 四、解析入口有基准时走本地规则，给出具体日期 ----------

const parsed = await parseOne(T_NEXTWEEK, BASE);
check(
  "R2 解析入口 截止日期给具体日期",
  parsed.analysis.deadline,
  "2026年11月11日"
);
check("R2 解析入口 来源为本地规则", parsed.analysis._source, "rule");
check("R2 解析入口 不再标待确认", parsed.analysis._datePending, false);

// ---------- 五、保存到通知里的基准，刷新后补事项仍有效 ----------

const migratedWithBase = migrateNotice({
  id: "x1",
  text: T_NEXTWEEK,
  publishedAt: "2026-11-03",
  analysis: {},
});
check(
  "R6 迁移 有存下基准 事项日期是具体日期",
  migratedWithBase.items[0].date,
  "2026年11月11日"
);
check("R6 迁移 有存下基准 状态正常", migratedWithBase.items[0].dateStatus, "ok");

const migratedNoBase = migrateNotice({
  id: "x2",
  text: T_NEXTWEEK,
  publishedAt: "",
  analysis: {},
});
check(
  "R6 迁移 基准为空 保持待确认",
  migratedNoBase.items[0].date,
  "下周三"
);
check(
  "R6 迁移 基准为空 状态待确认",
  migratedNoBase.items[0].dateStatus,
  "pending"
);

const migratedOld = migrateNotice({
  id: "x3",
  text: T_NEXTWEEK,
  analysis: {},
});
check(
  "R6 迁移 老通知没有这个字段 不报错且仍待确认",
  migratedOld.items[0].date,
  "下周三"
);

// ---------- 六、纯告知负例不因为加了基准就硬造事项 ----------

check("负例 表彰通报 有基准仍零事项", buildItems(N_HONOR, BASE).length, 0);
check("负例 系统上线 有基准仍零事项", buildItems(N_ONLINE, BASE).length, 0);
check("负例 放假安排 有基准仍零事项", buildItems(N_HOLIDAY, BASE).length, 0);

// ---------- 七、页面接线：基准必须真的传下去 ----------

check(
  "接线 单条解析把基准传给抽取函数",
  pageSrc.includes("parseOne(text, baseOpts)"),
  true
);
check(
  "接线 单条解析把基准传给事项函数",
  pageSrc.includes("items: buildItems(text, baseOpts)"),
  true
);
check(
  "接线 多通知逐条解析也传基准",
  pageSrc.includes(
    "parseOne(t, { publishedAt: publishedAt || \"\" })"
  ),
  true
);
check(
  "接线 作为单条解析也传基准",
  pageSrc.includes("parseOne(singleText, baseOpts)"),
  true
);
const savedBaseLines =
  (
    pageSrc.match(
      /publishedAt: publishedAt \|\| "",\r?\n\s+deadlineDate/g
    ) || []
  ).length;
check("接线 单条保存与批量保存都存下发布日期", savedBaseLines, 2);
check(
  "接线 发布日期状态初值为空串 不许默认今天",
  pageSrc.includes("const [publishedAt, setPublishedAt] = useState(\"\");"),
  true
);
check(
  "接线 弹窗收到发布日期与回调",
  pageSrc.includes("onPublishedAtChange={setPublishedAt}"),
  true
);
check(
  "接线 迁移补事项时读存下的发布日期",
  migrateSrc.includes(
    "const base = typeof n.publishedAt === \"string\" ? n.publishedAt : \"\""
  ),
  true
);
check(
  "接线 迁移补事项时把基准传给事项函数",
  migrateSrc.includes("buildItems(text, { publishedAt: base })"),
  true
);
check("弹窗 有日期输入框", dialogSrc.includes("type=\"date\""), true);
check(
  "弹窗 日期框受状态控制",
  dialogSrc.includes("value={publishedAt || \"\"}"),
  true
);
check(
  "弹窗 日期框变化会回写状态",
  dialogSrc.includes("onPublishedAtChange(e.target.value)"),
  true
);
check(
  "弹窗 有留空保持待确认的说明",
  dialogSrc.includes("留空就保持待确认"),
  true
);
check(
  "反向 页面不许再出现丢掉基准的 parseOne 调用",
  /parseOne\(text\)|parseOne\(singleText\)|parseOne\(t\)/.test(pageSrc),
  false
);

// ---------- 八、提示文案：不能对着原文词说已经按今天换算过 ----------

check(
  "文案 模型换算提示只在显示具体日期时才亮",
  panelSrc.includes("!isFuzzyDate(text)"),
  true
);
check(
  "文案 判断函数从正确的文件导入",
  panelSrc.includes(
    'describeParseError, isFuzzyDate } from "../lib/aiExtract.js"'
  ),
  true
);
check(
  "文案 待确认那句提示仍保留",
  panelSrc.includes("日期待确认，请补充发布日期以便换算"),
  true
);
check("文案 下周三判为模糊说法", isFuzzyDate("下周三"), true);
check("文案 明天判为模糊说法", isFuzzyDate("明天"), true);
check(
  "文案 具体日期不判为模糊说法",
  isFuzzyDate("2026年11月11日"),
  false
);
check("文案 月日写法不判为模糊说法", isFuzzyDate("11月5日"), false);

// ---------- 金丝雀：故意写错，必须报差异 ----------

let canary = 0;
let canaryFail = 0;
function canaryCheck(name, actual, wrongExpected) {
  const a = Array.isArray(actual) ? JSON.stringify(actual) : actual;
  const e = Array.isArray(wrongExpected)
    ? JSON.stringify(wrongExpected)
    : wrongExpected;
  canary++;
  if (a !== e) canaryFail++;
}

canaryCheck(
  "金丝雀 把换算后的日期写成原文词",
  firstDate(T_NEXTWEEK, BASE),
  "下周三"
);
canaryCheck(
  "金丝雀 断言一个源码里绝不存在的占位串",
  pageSrc.includes("绝不存在的占位串"),
  true
);

// ---------- 输出 ----------

console.log("第五轮自检回归（通知发布日期入口）");
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
