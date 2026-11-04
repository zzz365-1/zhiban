/**
 * 第六轮自检回归：字段定位与多通知链路。
 *
 * 用法：node scripts/test-round6.mjs
 *
 * 动态断言全部 import 生产模块，断言前不做归一化。
 * 静态断言 readFileSync 读页面、弹窗、面板与库源码，钉住本轮改过的接线。
 * 全程零网络零密钥，只测本地规则与纯函数路径。
 * 末尾两条金丝雀故意期待失败，用来证明断言真的会报红。
 */

import { readFileSync } from "node:fs";
import { locateTokenInText, findTitleSpan, findSpan } from "../app/lib/fieldLocate.js";
import { buildUserMessage } from "../app/lib/parsePrompt.js";
import { buildItems } from "../app/lib/noticeItems.js";

const NONE = { publishedAt: "" };

// 一条截止类通知，空基准也要能拆出事项（对应批量逐条补事项）
const T_DEADLINE =
  "关于报送实验室安全自查表的通知\n" +
  "请各班班长于11月5日下午5点前将实验室安全自查表交至学院办公室A201。";

const SOURCE_TEXT =
  "关于报送实验室安全自查表的通知\n" +
  "请各班班长于11月5日下午5点前将实验室安全自查表交至学院办公室A201。";

const read = (rel) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

const fieldLocateSrc = read("../app/lib/fieldLocate.js");
const panelSrc = read("../app/components/AnalysisPanel.js");
const pageSrc = read("../app/page.js");
const multiSrc = read("../app/components/MultiResultPanel.js");
const routeSrc = read("../app/api/parse/route.js");
const aiExtractSrc = read("../app/lib/aiExtract.js");
const promptSrc = read("../app/lib/parsePrompt.js");
const dialogSrc = read("../app/components/NewNoticeDialog.js");

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

// ---------- 一、标题定位用显示出来的文字 ----------

const titleHit = findTitleSpan(SOURCE_TEXT, "关于报送实验室安全自查表的通知");
check(
  "D1 短标题定位返回对象",
  titleHit !== null && typeof titleHit === "object",
  true
);
check(
  "D1 短标题定位区间原文正好是标题",
  titleHit ? SOURCE_TEXT.slice(titleHit.start, titleHit.end) : null,
  "关于报送实验室安全自查表的通知"
);

const longTitle = "关于报送实验室安全自查表的通知以及有关事项的补充说明和材料清单统一整理上报";
const longDisplay = longTitle.slice(0, 40) + "…";
const longSource =
  "关于开展年度综合检查工作的通知\n" +
  longTitle + "\n" +
  "请各单位于12月3日前将自查情况汇总上报。";
const longPrefix = longDisplay.slice(0, -1);
const longHit = findTitleSpan(longSource, longDisplay);
check(
  "D2 超长标题按显示文字前缀定位",
  longHit !== null,
  true
);
check(
  "D2 超长标题区间原文是显示文字去掉省略号后的前缀",
  longHit ? longSource.slice(longHit.start, longHit.end) : null,
  longPrefix
);
check(
  "D2 该前缀确实存在于原文",
  longSource.includes(longPrefix),
  true
);

check(
  "D3 原文没有这段文字时返回 null",
  findTitleSpan(SOURCE_TEXT, "这是一段原文里绝不存在的标题"),
  null
);
check(
  "D3 空原文返回 null",
  findTitleSpan("", "关于报送实验室安全自查表的通知"),
  null
);

// ---------- 二、字段定位原有语义不许改坏 ----------

const analysisNoTitle = {
  deadline: "11月5日",
  time: "17:00",
  summary: "各班班长于11月5日17:00前报送自查表",
  category: "行政",
};
check(
  "D4 analysis 不含 title 时定位标题字段返回 null",
  findSpan(SOURCE_TEXT, { key: "title" }, analysisNoTitle),
  null
);
check(
  "D4 定位截止日期返回区间",
  findSpan(SOURCE_TEXT, { key: "deadline" }, analysisNoTitle) !== null,
  true
);
check(
  "D4 定位材料列表要求每个值都能找到",
  findSpan(SOURCE_TEXT, { key: "materials" }, {
    materials: ["实验室安全自查表"],
  }) !== null,
  true
);
check(
  "D4 编造的材料定位不到返回 null",
  findSpan(SOURCE_TEXT, { key: "materials" }, {
    materials: ["实验室安全自查表", "绝不存在的材料名"],
  }),
  null
);
check(
  "D4 程序换算的日期视为原文没有",
  findSpan(SOURCE_TEXT, { key: "deadline" }, {
    deadline: "2026年11月5日",
    _inferredDeadline: true,
  }),
  null
);
const tokenHit = locateTokenInText(SOURCE_TEXT, "11月5日");
check(
  "D4 单 token 定位返回对象",
  tokenHit !== null && typeof tokenHit === "object",
  true
);
check(
  "D4 单 token 定位命中原文起点",
  tokenHit ? tokenHit.start : null,
  SOURCE_TEXT.indexOf("11月5日")
);
check(
  "D4 单 token 定位命中原文终点",
  tokenHit ? tokenHit.end : null,
  SOURCE_TEXT.indexOf("11月5日") + "11月5日".length
);

// ---------- 三、提示词里的示例用真换行 ----------

const userMsg = buildUserMessage("请各班于11月5日前报送材料。");
check("P1 用户消息含真换行字符", userMsg.includes("\n"), true);
check(
  "P1 用户消息不含字面反斜杠加字母 n",
  userMsg.includes("\\n"),
  false
);

// ---------- 四、空基准也能拆出事项（批量逐条补事项） ----------

const itemsNoBase = buildItems(T_DEADLINE, NONE);
check("I1 空基准至少拆出一条事项", itemsNoBase.length >= 1, true);
check("I1 空基准首条保留原文日期词", itemsNoBase[0].date, "11月5日");
check("I1 空基准首条时间", itemsNoBase[0].time, "17:00");

// ---------- 五、静态断言：八个源码文件 ----------

// 5.1 字段定位库
check(
  "S1 fieldLocate 导出 findTitleSpan 签名",
  fieldLocateSrc.includes("export function findTitleSpan(text, displayText)"),
  true
);
check(
  "S1 标题定位去省略号用 endsWith",
  fieldLocateSrc.includes("displayText.endsWith(suffix)"),
  true
);
check(
  "S1 标题定位按前缀在原文找",
  fieldLocateSrc.includes("text.indexOf(prefix)"),
  true
);

// 5.2 分析面板
check(
  "S2 面板从字段定位库导入",
  panelSrc.includes('import { findSpan, findTitleSpan } from "../lib/fieldLocate.js"'),
  true
);
check(
  "S2 摘要与分类不做原文核对",
  panelSrc.includes('field.key === "summary" || field.key === "category"'),
  true
);
check(
  "S2 标题定位传原文与显示文字",
  panelSrc.includes("findTitleSpan(draftText, displayText)"),
  true
);
check(
  "S2 空摘要占位文案",
  panelSrc.includes('text === "暂无摘要"'),
  true
);
check(
  "S2 本地换算日期有标记",
  panelSrc.includes("analysis._locallyResolved"),
  true
);
check(
  "S2 本地换算日期按二十四小时制显示",
  panelSrc.includes("这里是换算后的二十四小时制写法"),
  true
);

// 5.3 页面
const confirmSplitStart = pageSrc.indexOf("function handleConfirmSplit");
// 下一个函数可能是普通 function，也可能是 async function，取更靠前的那个
const nextPlainFnIdx =
  confirmSplitStart === -1
    ? -1
    : pageSrc.indexOf("\n  function ", confirmSplitStart + 1);
const nextAsyncFnIdx =
  confirmSplitStart === -1
    ? -1
    : pageSrc.indexOf("\n  async function ", confirmSplitStart + 1);
const confirmSplitEnd =
  confirmSplitStart === -1
    ? -1
    : [nextPlainFnIdx, nextAsyncFnIdx]
        .filter((idx) => idx !== -1)
        .reduce((min, idx) => (min === -1 || idx < min ? idx : min), -1);
const confirmSplitSrc =
  confirmSplitStart === -1
    ? ""
    : pageSrc.slice(
        confirmSplitStart,
        confirmSplitEnd === -1 ? pageSrc.length : confirmSplitEnd
      );
check(
  "S3 确认切分函数片段能找到",
  confirmSplitSrc.length > 0,
  true
);
check(
  "S3 确认切分函数片段止于下一个函数",
  confirmSplitSrc.includes("handleParseAsSingle"),
  false
);
// 只看落结果之后、setView("notices") 之前这一小段里有没有清脏标记
const afterBatchSrc = (() => {
  const batchIdx = confirmSplitSrc.indexOf("setBatchResults(results)");
  if (batchIdx === -1) return "";
  const tail = confirmSplitSrc.slice(batchIdx);
  const endIdx = tail.indexOf('setView("notices")');
  return endIdx === -1 ? tail : tail.slice(0, endIdx);
})();
check(
  "S3 批量确认后先落结果再清脏标记",
  /setBatchResults\(results\)[\s\S]*?setDirty\(false\)/.test(afterBatchSrc),
  true
);
check(
  "S3 批量逐条解析传基准给事项函数",
  pageSrc.includes("items: buildItems(t, baseOpts)"),
  true
);
check(
  "S3 批量逐条解析传基准给解析函数",
  pageSrc.includes("parseOne(t, baseOpts)"),
  true
);
check(
  "S3 本地识别来源标签与本地识别同一函数",
  /source === "rule"/.test(pageSrc),
  true
);
check(
  "S3 依据原句区间按字符串判断",
  pageSrc.includes('typeof span === "string"'),
  true
);
check(
  "S3 依据原句下标按整数校验",
  pageSrc.includes("Number.isInteger(s)"),
  true
);
check(
  "S3 批量保存的通知带顶层 items",
  /handleBatchSave[\s\S]*?items\s*:/.test(pageSrc),
  true
);

// 5.4 多通知面板
check(
  "S4 多通知标题过长截断阈值",
  multiSrc.includes("s.length > 30"),
  true
);
check(
  "S4 页面给多通知面板传了保存回调与可用条件",
  pageSrc.includes("onSave={handleSave}") &&
    pageSrc.includes("canSave={!dirty && batchSavable > 0 && !parsing}"),
  true
);
check(
  "S4 多通知面板按钮点击调用保存回调",
  multiSrc.includes("onClick={() => {") && multiSrc.includes("if (onSave) onSave();"),
  true
);

// 5.5 解析接口
check(
  "S5 服务端保留活动日期",
  routeSrc.includes("eventDate: normalizeStr(parsed.eventDate)"),
  true
);
check(
  "S5 服务端保留活动时间",
  routeSrc.includes("eventTime: normalizeStr(parsed.eventTime)"),
  true
);
check(
  "S5 服务端保留活动结束时间",
  routeSrc.includes("eventEndTime: normalizeStr(parsed.eventEndTime)"),
  true
);
check(
  "S5 服务端保留截止结束时间",
  routeSrc.includes("endTime: normalizeStr(parsed.endTime)"),
  true
);

// 5.6 抽取合并
check(
  "S6 结束时间按基准优先回填",
  aiExtractSrc.includes("const endTime = base.endTime || aiResult.endTime || null"),
  true
);
const mergeReturnStart = aiExtractSrc.lastIndexOf("return {");
const mergeReturnSrc =
  mergeReturnStart === -1
    ? ""
    : aiExtractSrc.slice(mergeReturnStart, aiExtractSrc.indexOf("};", mergeReturnStart) + 2);
check(
  "S6 取到合并函数的返回对象源码",
  mergeReturnSrc.length > 0,
  true
);
check(
  "S6 返回对象含简写属性 endTime",
  /\r?\n\s+endTime,\r?\n/.test(mergeReturnSrc),
  true
);
check(
  "S6 返回对象含简写属性 eventEndTime",
  /\r?\n\s+eventEndTime,\r?\n/.test(mergeReturnSrc),
  true
);

// 5.7 提示词源码转义
check(
  "S7 用户消息拼接处是转义序列表��",
  promptSrc.includes(
    'return FEW_SHOT_EXAMPLE + "\\n\\n现在请处理这条通知：\\n" + text;'
  ),
  true
);
check(
  "S7 源码里不再出现连续两个反斜杠加 n",
  promptSrc.includes("\\\\n"),
  false
);

// 5.8 新建弹窗
check(
  "S8 日期不合法时禁用解析按钮",
  dialogSrc.includes("const parseDisabled = isEmpty || !!parsing || !!dateError"),
  true
);

check(
  "S8 日期不合法分支同时清空回传",
  dialogSrc.includes("setLastCommitted(\"\")") &&
    dialogSrc.includes('if (onPublishedAtChange) onPublishedAtChange("");'),
  true
);

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
  "金丝雀 把定位区间原文写成别的",
  titleHit ? SOURCE_TEXT.slice(titleHit.start, titleHit.end) : null,
  "绝不匹配的标题"
);
canaryCheck(
  "金丝雀 断言源码里绝不存在的占位串",
  pageSrc.includes("绝不存在的占位串第六轮"),
  true
);

// ---------- 输出 ----------

console.log("第六轮自检回归（字段定位与多通知链路）");
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
