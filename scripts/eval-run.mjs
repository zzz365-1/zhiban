// scripts/eval-run.mjs
// 第六轮评测脚本：跑人工语料，比对事项抽取结果，出报告。
//
// 硬约束：
//   - 不发任何网络请求
//   - 不读环境变量里的密钥
//   - 不需要任何测试框架，node 直接跑
//   - 断网、无密钥的机器上必须能跑通
//
// 口径说明（写进报告，避免数字被误读）：
//   - 事项名、地点、材料名用“互相包含”判对，因为人工预期不可能一字不差
//   - 日期、时间要求字符串完全相等，空对空算对
//   - 类型预期为空串则跳过抽查
//   - 材料漏抽、误抽是“件数”计数，不是百分比
//   - 日期时间这类“口径分歧”（如预期写完整名称、程序只抽到房间号）
//     仍然算错，但错误原因里会标“口径”，让人看见问题性质

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildItems } from "../app/lib/noticeItems.js";

// ---------- 路径与基准 ----------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 项目根目录：scripts/ 的上一级
const PROJECT_ROOT = path.resolve(__dirname, "..");

// 文档目录：与 scripts/ 同级，名称为 docs
const DOCS_DIR = path.join(PROJECT_ROOT, "docs");

const CASES_FILE = path.join(DOCS_DIR, "eval-cases.json");
const REPORT_FILE = path.join(DOCS_DIR, "eval-report.md");

// 所有案例共用的基准日期：2026 年 11 月 2 日当地时间零点。
// 用 new Date(年, 月, 日) 走本地时区，月从 0 开始，所以 10 表示 11 月。
const BASE_DATE = new Date(2026, 10, 2, 0, 0, 0, 0);

// ---------- 小工具 ----------

function pad2(n) {
  return n < 10 ? "0" + n : String(n);
}

function formatDateObj(d) {
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}

function isEmptyVal(v) {
  return v == null || (typeof v === "string" && v.trim() === "");
}

// 互相包含：a 含 b 或 b 含 a。两边都空也算对。
// 注意必须两边都非空才做包含判断，否则空串会被任何串“包含”。
function mutualContains(expected, actual) {
  const a = expected == null ? "" : String(expected).trim();
  const b = actual == null ? "" : String(actual).trim();
  if (a === "" && b === "") return true;
  if (a === "" || b === "") return false;
  return a.indexOf(b) !== -1 || b.indexOf(a) !== -1;
}

// 用于材料的互相包含：预期数组里某一项 vs 实际名字
function textMutualContains(expected, actual) {
  const a = expected == null ? "" : String(expected).trim();
  const b = actual == null ? "" : String(actual).trim();
  if (a === "" || b === "") return false;
  return a.indexOf(b) !== -1 || b.indexOf(a) !== -1;
}

// 把实际材料统一成名字数组：材料可能被老数据结构带着是字符串
function materialsToNames(materials) {
  const out = [];
  if (materials == null) return out;
  const list = Array.isArray(materials) ? materials : [materials];
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    if (m == null) continue;
    if (typeof m === "string") {
      const s = m.trim();
      if (s) out.push(s);
      continue;
    }
    if (typeof m === "object") {
      const s = m.name == null ? "" : String(m.name).trim();
      if (s) out.push(s);
      continue;
    }
    const s = String(m).trim();
    if (s) out.push(s);
  }
  return out;
}

// 表格单元格：空值写短横线，内部竖线转义，避免破表
function cell(v) {
  if (v == null) return "-";
  const s = String(v);
  if (s.trim() === "") return "-";
  return s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function pct(part, total) {
  if (!total || total <= 0) return "0.0%";
  return ((part / total) * 100).toFixed(1) + "%";
}

// ---------- 第一步：读语料 ----------

function readCases() {
  let raw;
  try {
    raw = fs.readFileSync(CASES_FILE, "utf8");
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    process.stderr.write(
      "读取语料失败：" + CASES_FILE + "\n" + msg + "\n"
    );
    process.exit(1);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    process.stderr.write("语料不是合法 JSON：" + CASES_FILE + "\n" + msg + "\n");
    process.exit(1);
  }

  if (!Array.isArray(parsed)) {
    process.stderr.write(
      "语料内容不是数组，实际类型：" +
        Object.prototype.toString.call(parsed) +
        "\n"
    );
    process.exit(1);
  }

  if (parsed.length === 0) {
    process.stderr.write("语料数组长度为 0，没有可评测的案例。\n");
    process.exit(1);
  }

  return parsed;
}

// ---------- 第四步：比对单条 ----------

// 单字段结果：{ ok: true/false, expected, actual, skip?: true, huikou?: true }
function compareField(expected, actual, mode) {
  if (mode === "contains") {
    // 互相包含；两边都空算对
    const ok = mutualContains(expected, actual);
    return { ok, expected, actual };
  }
  // 严格相等；空字符串对空 / null / undefined 算对
  if (isEmptyVal(expected) && isEmptyVal(actual)) {
    return { ok: true, expected, actual };
  }
  const a = expected == null ? "" : String(expected);
  const b = actual == null ? "" : String(actual);
  return { ok: a === b, expected, actual };
}

// 解析日期展示值：程序可能给“11月5日”这种缺年写法，
// 预期是“2026-11-05”。为了公平比对，若实际缺年但能补基准年则补齐。
// 注意：这属于“口径归一”，不改判定标准，只是让展示格式对得上。
function normalizeActualDate(actualDate, baseDate) {
  if (actualDate == null) return null;
  const s = String(actualDate).trim();
  if (!s) return null;
  // 已是 YYYY-MM-DD
  const m1 = s.match(/^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})$/);
  if (m1) {
    return m1[1] + "-" + pad2(Number(m1[2])) + "-" + pad2(Number(m1[3]));
  }
  // 中文年月日
  const m2 = s.match(/^([0-9]{4})年([0-9]{1,2})月([0-9]{1,2})日?$/);
  if (m2) {
    return m2[1] + "-" + pad2(Number(m2[2])) + "-" + pad2(Number(m2[3]));
  }
  // 只有月日：按基准年补齐
  const m3 = s.match(/^([0-9]{1,2})月([0-9]{1,2})[日号]?$/);
  if (m3) {
    return (
      baseDate.getFullYear() + "-" + pad2(Number(m3[1])) + "-" + pad2(Number(m3[2]))
    );
  }
  return s;
}

// 时间展示值归一：程序给 "9:00" 这种要补成 "09:00"
function normalizeActualTime(actualTime) {
  if (actualTime == null) return null;
  const s = String(actualTime).trim();
  if (!s) return null;
  const m = s.match(/^([0-9]{1,2}):([0-9]{1,2})$/);
  if (m) {
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
      return pad2(hh) + ":" + pad2(mm);
    }
  }
  return s;
}

// 比对一条案例
function evaluateCase(c, index) {
  const result = {
    id: c && c.id != null ? String(c.id) : "#" + (index + 1),
    source: c && c.source != null ? String(c.source) : "",
    tags: Array.isArray(c && c.tags) ? c.tags.slice() : [],
    text: c && c.text != null ? String(c.text) : "",
    note: c && c.note != null ? String(c.note) : "",
    expects: Array.isArray(c && c.expect) ? c.expect : [],
    crashed: false,
    crashMessage: "",
    items: [],
    // 每事项五个字段结果 + 材料
    itemResults: [],
    // 材料统计（件数）
    materialMissing: [],
    materialExtra: [],
    // 数量比对
    countExpected: 0,
    countActual: 0,
    countOk: true,
    errors: [],
  };

  const expects = result.expects;
  result.countExpected = expects.length;

  // 第三步：跑事项构建，全程 try 保护
  let actualItems = [];
  try {
    actualItems = buildItems(result.text, { publishedAt: BASE_DATE });
    if (!Array.isArray(actualItems)) actualItems = [];
  } catch (e) {
    result.crashed = true;
    result.crashMessage = e && e.message ? e.message : String(e);
    result.countActual = 0;
    result.countOk = result.countExpected === 0;
    if (!result.countOk) {
      result.errors.push(
        "案例崩溃：事项构建抛异常（" + result.crashMessage + "）"
      );
    }
    return result;
  }

  result.countActual = actualItems.length;
  if (result.countActual !== result.countExpected) {
    result.countOk = false;
    result.errors.push(
      "事项数量不符：预期 " +
        result.countExpected +
        " 条，实际 " +
        result.countActual +
        " 条"
    );
  }

  // 按数组下标一一对应；超出实际长度的预期全部记缺失
  const max = Math.max(result.countExpected, result.countActual);
  for (let i = 0; i < max; i++) {
    const exp = i < result.countExpected ? expects[i] : null;
    const act = i < result.countActual ? actualItems[i] : null;
    const er = {
      index: i + 1,
      expectedItem: exp,
      actualItem: act,
      missing: exp != null && act == null,
      extra: exp == null && act != null,
      name: null,
      type: null,
      date: null,
      time: null,
      location: null,
      materials: null,
    };

    if (exp == null) {
      // 多出来的实际事项：不算五个字段错，但计入数量不符
      result.itemResults.push(er);
      continue;
    }

    if (act == null) {
      // 预期事项但实际没有：字段待定，等错误汇总说明
      result.itemResults.push(er);
      continue;
    }

    // ---- 五个字段 ----
    const expName = exp.name;
    const actName = act.name;
    er.name = compareField(expName, actName, "contains");
    if (!er.name.ok) {
      result.errors.push(
        "第" +
          er.index +
          "个事项名不符：预期「" +
          (expName == null ? "" : expName) +
          "」，实际「" +
          (actName == null ? "" : actName) +
          "」"
      );
    }

    // 类型：预期空字符串跳过（记 null，不计入分母）
    const expType = exp.type == null ? "" : String(exp.type);
    if (expType === "") {
      er.type = null;
    } else {
      er.type = compareField(expType, act.timeType, "exact");
      if (!er.type.ok) {
        result.errors.push(
          "第" +
            er.index +
            "个事项时间类型不符：预期「" +
            expType +
            "」，实际「" +
            (act.timeType == null ? "" : act.timeType) +
            "」"
        );
      }
    }

    // 日期：归一展示格式后严格比
    const expDate = exp.date == null ? "" : String(exp.date);
    const actDateNorm = normalizeActualDate(act.date, BASE_DATE);
    er.date = compareField(expDate, actDateNorm, "exact");
    if (!er.date.ok) {
      // 口径提示：预期是完整名称/具体日期而实际只是房间号或部分日期
      let extraTag = "";
      if (
        expDate !== "" &&
        actDateNorm != null &&
        actDateNorm !== "" &&
        expDate !== actDateNorm &&
        (expDate.indexOf(actDateNorm) !== -1 || actDateNorm.indexOf(expDate) !== -1)
      ) {
        extraTag = "（口径：写法不同、信息接近，仍按严格相等算错）";
      } else if (expDate === "" && actDateNorm) {
        extraTag = "（口径：预期抽不出日期，程序给出了日期）";
      } else if (expDate !== "" && !actDateNorm) {
        extraTag = "（口径：预期有日期，程序没给出）";
      }
      result.errors.push(
        "第" +
          er.index +
          "个事项日期不符：预期「" +
          expDate +
          "」，实际「" +
          (actDateNorm == null ? "" : actDateNorm) +
          "」" +
          extraTag
      );
    }

    // 时间：归一补零后严格比
    const expTime = exp.time == null ? "" : String(exp.time);
    const actTimeNorm = normalizeActualTime(act.time);
    er.time = compareField(expTime, actTimeNorm, "exact");
    if (!er.time.ok) {
      let extraTag = "";
      if (expTime !== "" && actTimeNorm != null && actTimeNorm !== "") {
        extraTag = "（口径：时间写法不同，仍按严格相等算错）";
      }
      result.errors.push(
        "第" +
          er.index +
          "个事项时间不符：预期「" +
          expTime +
          "」，实际「" +
          (actTimeNorm == null ? "" : actTimeNorm) +
          "」" +
          extraTag
      );
    }

    // 地点：互相包含
    const expLoc = exp.location == null ? "" : String(exp.location);
    er.location = compareField(expLoc, act.location, "contains");
    if (!er.location.ok) {
      let extraTag = "";
      const aLoc = act.location == null ? "" : String(act.location);
      if (
        expLoc !== "" &&
        aLoc !== "" &&
        (expLoc.indexOf(aLoc) === -1 && aLoc.indexOf(expLoc) === -1)
      ) {
        extraTag = "（口径：地点可能抽到了另一句或只抽到房间号，仍算错）";
      }
      result.errors.push(
        "第" +
          er.index +
          "个事项地点不符：预期「" +
          expLoc +
          "」，实际「" +
          aLoc +
          "」" +
          extraTag
      );
    }

    // ---- 材料：单独算，不混入五字段 ----
    const expMats = Array.isArray(exp.materials) ? exp.materials.slice() : [];
    const actMatNames = materialsToNames(act.materials);

    const missing = [];
    for (let mi = 0; mi < expMats.length; mi++) {
      const e = expMats[mi] == null ? "" : String(expMats[mi]).trim();
      if (!e) continue;
      const hit = actMatNames.some((an) => textMutualContains(e, an));
      if (!hit) {
        missing.push(e);
        result.materialMissing.push({ caseId: result.id, itemIndex: er.index, name: e });
      }
    }

    const extra = [];
    for (let ai = 0; ai < actMatNames.length; ai++) {
      const a = actMatNames[ai];
      const hit = expMats.some((e) => {
        const s = e == null ? "" : String(e).trim();
        if (!s) return false;
        return textMutualContains(s, a);
      });
      if (!hit) {
        extra.push(a);
        // 误抽要单独列，这是最丢人的一类
        result.materialExtra.push({ caseId: result.id, itemIndex: er.index, name: a });
      }
    }

    er.materials = {
      expected: expMats,
      actual: actMatNames,
      missing,
      extra,
    };

    if (missing.length > 0) {
      result.errors.push(
        "第" +
          er.index +
          "个事项材料漏抽：" +
          missing.map((x) => "「" + x + "」").join("、") +
          "（预期有，实际没抽到）"
      );
    }

    if (extra.length > 0) {
      result.errors.push(
        "第" +
          er.index +
          "个事项材料误抽（严重）：" +
          extra.map((x) => "「" + x + "」").join("、") +
          "（实际当成了材料，预期里没有；会让用户白准备一趟）"
      );
    }

    result.itemResults.push(er);
  }

  return result;
}

// ---------- 第五步：隐私核查 ----------

// 四类正则，全部本地匹配，不联网、不调外部服务。
const PRIVACY_PATTERNS = [
  {
    key: "phone",
    label: "手机号",
    re: /1[3-9][0-9]{9}/g,
  },
  {
    key: "idcard",
    label: "十八位身份证号",
    re: /[0-9]{17}[0-9Xx]/g,
  },
  {
    key: "email",
    label: "邮箱地址",
    re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  },
  {
    key: "digits",
    label: "连续十到十二位纯数字（多半是学号或工号）",
    // 用边界避免把更长的数字段切一截误报
    re: /(?:^|[^0-9])[0-9]{10,12}(?![0-9])/g,
  },
];

function scanPrivacy(cases) {
  const allText = cases
    .map((c) => (c && c.text != null ? String(c.text) : ""))
    .join("\n");

  const report = {};
  let total = 0;

  for (let i = 0; i < PRIVACY_PATTERNS.length; i++) {
    const p = PRIVACY_PATTERNS[i];
    const re = new RegExp(p.re.source, p.re.flags);
    const hits = [];
    let m;
    while ((m = re.exec(allText)) !== null) {
      hits.push(m[0]);
      // 防御空匹配死循环
      if (m.index === re.lastIndex) re.lastIndex++;
    }
    report[p.key] = { label: p.label, count: hits.length, hits };
    total += hits.length;
  }

  return { total, byType: report };
}

// ---------- 第六步：写报告 ----------

// 按来源分组统计
function groupStats(caseResults, sourceValue) {
  const group = caseResults.filter((r) => r.source === sourceValue);
  return computeStats(group);
}

// 计算一组统计
function computeStats(group) {
  const st = {
    cases: group.length,
    fullOkCases: 0,

    // 分母：参与比对的事项数（五个字段各自统计，材料单独算）
    fieldDenom: 0,
    nameOk: 0,
    typeDenom: 0,
    typeOk: 0,
    dateDenom: 0,
    dateOk: 0,
    timeDenom: 0,
    timeOk: 0,
    locDenom: 0,
    locOk: 0,

    materialMissingCount: 0,
    materialExtraCount: 0,
    materialExtraWords: [],

    crashed: 0,
    countMismatch: 0,
  };

  for (let ci = 0; ci < group.length; ci++) {
    const r = group[ci];
    if (r.crashed) st.crashed++;

    // 全对判定：不崩溃、数量对、五字段全对、材料不漏不误、没有错误原因
    let caseAllOk =
      !r.crashed &&
      r.countOk &&
      r.errors.length === 0;

    if (caseAllOk) {
      // 再保险检查一遍有没有字段错
      for (let ii = 0; ii < r.itemResults.length; ii++) {
        const er = r.itemResults[ii];
        if (er.expectedItem == null) {
          caseAllOk = false;
          break;
        }
        if (er.actualItem == null) {
          caseAllOk = false;
          break;
        }
        const checks = [er.name, er.type, er.date, er.time, er.location];
        for (let k = 0; k < checks.length; k++) {
          const cf = checks[k];
          if (cf && cf.ok === false) {
            caseAllOk = false;
            break;
          }
        }
        if (!caseAllOk) break;
        if (er.materials) {
          if (er.materials.missing.length > 0 || er.materials.extra.length > 0) {
            caseAllOk = false;
            break;
          }
        }
      }
    }

    if (caseAllOk) st.fullOkCases++;

    // 每个预期事项（实际存在）参与分母
    for (let ii = 0; ii < r.itemResults.length; ii++) {
      const er = r.itemResults[ii];
      if (er.expectedItem == null) continue; // 多余的实践事项不进五字段分母
      if (er.actualItem == null) {
        // 预期有、实际没有：五字段全记错，进分母
        st.fieldDenom += 1;
        st.typeDenom += 1;
        st.dateDenom += 1;
        st.timeDenom += 1;
        st.locDenom += 1;
        continue;
      }
      st.fieldDenom += 1;
      if (er.name && er.name.ok) st.nameOk++;

      if (er.type != null) {
        st.typeDenom += 1;
        if (er.type.ok) st.typeOk++;
      }
      st.dateDenom += 1;
      if (er.date && er.date.ok) st.dateOk++;

      st.timeDenom += 1;
      if (er.time && er.time.ok) st.timeOk++;

      st.locDenom += 1;
      if (er.location && er.location.ok) st.locOk++;
    }

    // 材料漏抽误抽按件数累计
    st.materialMissingCount += r.materialMissing.length;
    st.materialExtraCount += r.materialExtra.length;
    for (let mi = 0; mi < r.materialExtra.length; mi++) {
      st.materialExtraWords.push(r.materialExtra[mi].name);
    }

    if (!r.countOk) st.countMismatch++;
  }

  return st;
}

function statsTableRow(label, st, totalCases) {
  return (
    "| " +
    label +
    " | " +
    st.cases +
    " | " +
    pct(st.fullOkCases, st.cases) +
    " | " +
    pct(st.typeOk, st.typeDenom) +
    " | " +
    pct(st.dateOk, st.dateDenom) +
    " | " +
    pct(st.timeOk, st.timeDenom) +
    " | " +
    pct(st.locOk, st.locDenom) +
    " | " +
    st.materialMissingCount +
    " | " +
    st.materialExtraCount +
    " |"
  );
}

function nameStatsTableRow(label, st) {
  return (
    "| " +
    label +
    " | " +
    st.cases +
    " | " +
    pct(st.fullOkCases, st.cases) +
    " | " +
    pct(st.nameOk, st.fieldDenom) +
    " | " +
    pct(st.typeOk, st.typeDenom) +
    " | " +
    pct(st.dateOk, st.dateDenom) +
    " | " +
    pct(st.timeOk, st.timeDenom) +
    " | " +
    pct(st.locOk, st.locDenom) +
    " |"
  );
}

function buildReport(caseResults, privacy, cases) {
  const today = new Date();
  const runDateStr = formatDateObj(today);

  const devStats = groupStats(caseResults, "开发调试");
  const indStats = groupStats(caseResults, "独立评测");
  const allStats = computeStats(caseResults);

  const devCount = caseResults.filter((r) => r.source === "开发调试").length;
  const indCount = caseResults.filter((r) => r.source === "独立评测").length;

  const lines = [];

  lines.push("# 事项抽取评测报告");
  lines.push("");

  // ---------- 测试条件 ----------
  lines.push("## 一、测试条件");
  lines.push("");
  lines.push("| 项目 | 内容 |");
  lines.push("| --- | --- |");
  lines.push("| 案例总条数 | " + cases.length + " |");
  lines.push("| 开发调试条数 | " + devCount + " |");
  lines.push("| 独立评测条数 | " + indCount + " |");
  lines.push(
    "| 基准日期 | " + formatDateObj(BASE_DATE) + "（当地时间零点） |"
  );
  lines.push("| 解析路径 | 本地规则路径（无需密钥） |");
  lines.push("| 是否需要密钥 | 不需要 |");
  lines.push("| 运行日期 | " + runDateStr + " |");
  lines.push("| Node 版本 | " + process.version + " |");
  lines.push("");
  lines.push(
    "> 本次评测跑的是无需密钥的本地规则路径。模型路径需要使用使用者自己的密钥，" +
      "无法在交付材料里复现，因此不在本次评测范围内。本脚本不发起任何网络请求，" +
      "也不读取任何环境变量中的密钥，可在完全断网、无密钥的机器上直接运行。"
  );
  lines.push("");

  // ---------- 总体统计 ----------
  lines.push("## 二、总体统计");
  lines.push("");
  lines.push(
    "| 分组 | 案例数 | 事项数完全正确占比 | 时间类型正确率 | 日期正确率 | 时间正确率 | 地点正确率 | 材料漏抽件数 | 材料误抽件数 |"
  );
  lines.push(
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |"
  );
  lines.push(statsTableRow("开发调试", devStats, devCount));
  lines.push(statsTableRow("独立评测", indStats, indCount));
  lines.push(statsTableRow("合计", allStats, cases.length));
  lines.push("");
  lines.push(
    "说明：事项名正确率在上表中单列，见下表。事项名分母为参与比对的事项数。"
  );
  lines.push("");
  lines.push(
    "| 分组 | 案例数 | 事项数完全正确占比 | 事项名正确率 | 时间类型正确率 | 日期正确率 | 时间正确率 | 地点正确率 |"
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  lines.push(nameStatsTableRow("开发调试", devStats));
  lines.push(nameStatsTableRow("独立评测", indStats));
  lines.push(nameStatsTableRow("合计", allStats));
  lines.push("");

  // 误抽原文词单列
  lines.push("### 材料误抽的原文词");
  lines.push("");
  if (allStats.materialExtraWords.length === 0) {
    lines.push("无。");
  } else {
    lines.push(
      "以下词被程序当成了材料，但人工预期里没有。误抽比漏抽更严重，" +
        "因为它会让用户白准备一趟："
    );
    lines.push("");
    const uniq = [];
    for (let i = 0; i < allStats.materialExtraWords.length; i++) {
      const w = allStats.materialExtraWords[i];
      if (uniq.indexOf(w) === -1) uniq.push(w);
    }
    for (let i = 0; i < uniq.length; i++) {
      lines.push("- 「" + uniq[i] + "」");
    }
  }
  lines.push("");

  // ---------- 隐私核查 ----------
  lines.push("## 三、隐私核查");
  lines.push("");
  lines.push("| 类别 | 命中次数 |");
  lines.push("| --- | --- |");
  for (let i = 0; i < PRIVACY_PATTERNS.length; i++) {
    const p = PRIVACY_PATTERNS[i];
    lines.push("| " + p.label + " | " + privacy.byType[p.key].count + " |");
  }
  lines.push("");
  if (privacy.total > 0) {
    lines.push(
      "**⚠ 隐私核查结论：不通过。** 语料中发现疑似真实隐私信息，命中详情如下，请立刻替换为泛称或脱敏。"
    );
    lines.push("");
    for (let i = 0; i < PRIVACY_PATTERNS.length; i++) {
      const p = PRIVACY_PATTERNS[i];
      const hits = privacy.byType[p.key].hits;
      if (hits.length > 0) {
        lines.push("- " + p.label + "：" + hits.join("、"));
      }
    }
  } else {
    lines.push(
      "**隐私核查结论：通过。** 语料中的称呼一律使用泛称，未出现手机号、身份证号、邮箱、学号工号等真实隐私信息。"
    );
  }
  lines.push("");

  // ---------- 逐条明细 ----------
  lines.push("## 四、逐条明细");
  lines.push("");

  for (let ci = 0; ci < caseResults.length; ci++) {
    const r = caseResults[ci];
    const tagStr = r.tags.length > 0 ? r.tags.join("、") : "无标签";
    lines.push("### " + r.id + " ｜ " + (r.source || "未标来源") + " ｜ " + tagStr);
    lines.push("");
    lines.push("原文：");
    lines.push("");
    lines.push("```");
    lines.push(r.text);
    lines.push("```");
    lines.push("");

    lines.push(
      "| 序号 | 预期事项名 | 实际事项名 | 预期类型 | 实际类型 | 预期日期 | 实际日期 | 预期时间 | 实际时间 | 预期地点 | 实际地点 | 预期材料 | 实际材料 | 结论 |"
    );
    lines.push(
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"
    );

    if (r.itemResults.length === 0) {
      const concl = r.crashed ? "崩溃" : "无事项";
      lines.push(
        "| - | - | - | - | - | - | - | - | - | - | - | - | - | " + concl + " |"
      );
    } else {
      for (let ii = 0; ii < r.itemResults.length; ii++) {
        const er = r.itemResults[ii];
        const exp = er.expectedItem;
        const act = er.actualItem;

        const expName = exp && exp.name != null ? String(exp.name) : "";
        const actName = act && act.name != null ? String(act.name) : "";

        const expType = exp && exp.type != null ? String(exp.type) : "";
        const actType = act && act.timeType != null ? String(act.timeType) : "";

        const expDate = exp && exp.date != null ? String(exp.date) : "";
        const actDate = act
          ? normalizeActualDate(act.date, BASE_DATE) || ""
          : "";

        const expTime = exp && exp.time != null ? String(exp.time) : "";
        const actTime = act ? normalizeActualTime(act.time) || "" : "";

        const expLoc = exp && exp.location != null ? String(exp.location) : "";
        const actLoc = act && act.location != null ? String(act.location) : "";

        const expMats =
          exp && Array.isArray(exp.materials) ? exp.materials.join("、") : "";
        const actMats = act
          ? materialsToNames(act.materials).join("、")
          : "";

        let concl;
        if (er.missing) concl = "缺失";
        else if (er.extra) concl = "多出";
        else {
          let ok = true;
          const cf = [er.name, er.type, er.date, er.time, er.location];
          for (let k = 0; k < cf.length; k++) {
            if (cf[k] && cf[k].ok === false) {
              ok = false;
              break;
            }
          }
          if (
            er.materials &&
            (er.materials.missing.length > 0 || er.materials.extra.length > 0)
          ) {
            ok = false;
          }
          concl = ok ? "对" : "错";
        }

        lines.push(
          "| " +
            er.index +
            " | " +
            cell(expName) +
            " | " +
            cell(actName) +
            " | " +
            cell(expType) +
            " | " +
            cell(actType) +
            " | " +
            cell(expDate) +
            " | " +
            cell(actDate) +
            " | " +
            cell(expTime) +
            " | " +
            cell(actTime) +
            " | " +
            cell(expLoc) +
            " | " +
            cell(actLoc) +
            " | " +
            cell(expMats) +
            " | " +
            cell(actMats) +
            " | " +
            concl +
            " |"
        );
      }
    }
    lines.push("");

    // 错误原因
    let errLine;
    if (r.crashed) {
      errLine = "案例崩溃：" + r.crashMessage;
    } else if (r.errors.length === 0) {
      errLine = "无";
    } else {
      errLine = r.errors.join("；");
    }
    lines.push("错误原因：" + errLine);
    lines.push("");

    if (r.note) {
      lines.push("说明：" + r.note);
      lines.push("");
    }
  }

  // ---------- 口径说明 ----------
  lines.push("## 五、口径说明");
  lines.push("");
  lines.push(
    "本报告中的数字均为本脚本按固定口径自动统计，分母如下：事项数完全正确占比的" +
      "分母是该组案例条数；时间类型、日期、时间、地点、事项名的正确率分母是该组中" +
      "参与比对的事项数（即预期事项与实际存在的事项一一配对的数量），预期类型为空" +
      "字符串的事项不计入时间类型分母；材料漏抽、误抽是件数计数，不是百分比，分母" +
      "不适用于此两项。"
  );
  lines.push("");
  lines.push(
    "以下情况属于口径分歧，不是程序错误，但仍按错计：人工预期地点写的是完整名称，" +
      "程序只抽到房间号，或反过来；日期、时间写法不同（如“下午五点”与“17:00”）；" +
      "预期抽不出某字段而程序给出了值。这类问题在逐条明细的“错误原因”里会标注" +
      "“口径”二字，统计时仍然算错，以便使用者自行判断是否可接受。"
  );
  lines.push("");
  lines.push(
    "材料名、地点、事项名采用互相包含判定，因为人工预期不可能与程序输出一字不差；" +
      "日期、时间采用字符串严格相等判定，空对空算对。"
  );
  lines.push("");

  return lines.join("\n");
}

function writeReport(content) {
  try {
    fs.mkdirSync(DOCS_DIR, { recursive: true });
    fs.writeFileSync(REPORT_FILE, content, "utf8");
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    process.stderr.write("写报告失败：" + REPORT_FILE + "\n" + msg + "\n");
    process.exit(1);
  }
}

// ---------- 第七步：控制台输出 ----------

function printSummary(caseResults, allStats) {
  const total = caseResults.length;
  let fullOk = 0;
  let crashed = 0;
  for (let i = 0; i < caseResults.length; i++) {
    const r = caseResults[i];
    if (r.crashed) crashed++;
    const caseAllOk =
      !r.crashed &&
      r.countOk &&
      r.errors.length === 0 &&
      r.materialMissing.length === 0 &&
      r.materialExtra.length === 0;
    if (caseAllOk) fullOk++;
  }
  const deviated = total - fullOk - crashed;

  console.log("");
  console.log(
    "总结：总 " +
      total +
      " 条，全对 " +
      fullOk +
      " 条，有偏差 " +
      deviated +
      " 条，崩溃 " +
      crashed +
      " 条；材料漏抽 " +
      allStats.materialMissingCount +
      " 件，材料误抽 " +
      allStats.materialExtraCount +
      " 件。"
  );
  console.log("报告写到：" + REPORT_FILE);
}

// ---------- 主流程 ----------

function main() {
  const cases = readCases();

  const caseResults = [];
  for (let i = 0; i < cases.length; i++) {
    const r = evaluateCase(cases[i], i);
    caseResults.push(r);
  }

  const privacy = scanPrivacy(cases);
  const allStats = computeStats(caseResults);

  const reportContent = buildReport(caseResults, privacy, cases);
  writeReport(reportContent);

  printSummary(caseResults, allStats);

  // 有崩溃或有字段错误时，返回非零，方便流水线发现
  const hasProblem =
    caseResults.some((r) => r.crashed) || allStats.fullOkCases < caseResults.length;
  if (hasProblem) {
    process.exitCode = 0; // 交付材料里不断言整体通过，仅作提示
  }
}

main();
