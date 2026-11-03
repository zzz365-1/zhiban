// app/lib/noticeItems.js
// 把一条通知切成若干事项，每个事项自带日期/时间/地点/材料/对象和依据。
// 原则：拿不准就留空并标原因，绝不猜。

import { extractNotice } from "./extractNotice.js";
import { buildItemEvidence } from "./evidence.js";
import {
  normalizeChineseDate,
  resolveRelativeDate,
} from "./relativeDate.js";
import { buildDeadlineDate } from "./deadline.js";

// ---------- 状态文案 ----------

export const STATUS_LABEL = {
  ok: "",
  not_mentioned: "原文未提及",
  not_applicable: "不适用",
  pending: "待确认",
  failed: "解析存疑",
};

export function statusLabel(s) {
  if (s == null) return "";
  const v = STATUS_LABEL[s];
  return v == null ? "" : v;
}

// ---------- 切句 ----------

// 断句字符类：句号、分号、感叹号、问号、换行。逗号顿号不算断句。
const SENTENCE_BREAK = "[。；;！？!?" + String.fromCharCode(10) + "]";

// 空白字符类内容：空格 / 制表 / 换行 / 回车 / 全角空格
const SPACE_CLASS = String.fromCharCode(32, 9, 10, 13, 12288);

export function splitSentences(text) {
  const s = text == null ? "" : String(text);
  const out = [];
  if (!s) return out;

  const re = new RegExp(SENTENCE_BREAK);
  let start = 0;
  let i = 0;
  while (i < s.length) {
    if (re.test(s[i])) {
      const chunk = s.slice(start, i + 1);
      const leading =
        chunk.length -
        chunk.replace(new RegExp("^[" + SPACE_CLASS + "]+"), "").length;
      const trimmed = chunk.trim();
      if (trimmed) {
        out.push({ text: trimmed, start: start + leading });
      }
      start = i + 1;
    }
    i++;
  }
  if (start < s.length) {
    const chunk = s.slice(start);
    const leading =
      chunk.length -
      chunk.replace(new RegExp("^[" + SPACE_CLASS + "]+"), "").length;
    const trimmed = chunk.trim();
    if (trimmed) out.push({ text: trimmed, start: start + leading });
  }
  return out;
}

// ---------- 分类 ----------

// 手续类关键词：要办的事
const SUBMIT_WORDS = [
  "截止", "报送", "提交", "报名", "上交", "递交", "交到", "交至", "交于",
  "缴纳", "填写", "申请", "办理", "确认", "领取", "归还", "补交",
];

// 活动类关键词：要去参加的事
const EVENT_WORDS = [
  "举行", "举办", "召开", "开始", "比赛", "讲座", "检查", "培训", "会议",
  "评审", "初赛", "决赛", "开赛", "开场", "开幕", "签到", "集合", "出发",
];

function containsAny(text, words) {
  for (let i = 0; i < words.length; i++) {
    if (text.indexOf(words[i]) !== -1) return true;
  }
  return false;
}

// 返回 submit / event / null
export function classifySentence(sentence) {
  const raw = sentence && sentence.text != null ? String(sentence.text) : "";
  if (!raw) return null;

  const hasSubmit = containsAny(raw, SUBMIT_WORDS);
  const hasEvent = containsAny(raw, EVENT_WORDS);

  if (hasSubmit && !hasEvent) return "submit";
  if (hasEvent && !hasSubmit) return "event";
  if (hasSubmit && hasEvent) {
    // 两类词都有：先看“截止/报送/提交/报名”是不是更靠前
    const submitIdx = firstIndexOfAny(raw, SUBMIT_WORDS);
    const eventIdx = firstIndexOfAny(raw, EVENT_WORDS);
    if (submitIdx !== -1 && (eventIdx === -1 || submitIdx < eventIdx)) {
      return "submit";
    }
    if (eventIdx !== -1) return "event";
    return "submit";
  }
  return null;
}

function firstIndexOfAny(text, words) {
  let best = -1;
  for (let i = 0; i < words.length; i++) {
    const idx = text.indexOf(words[i]);
    if (idx !== -1 && (best === -1 || idx < best)) best = idx;
  }
  return best;
}

// ---------- 事项名称 ----------

// 去掉句尾的标点，去掉“请各班”“请各寝室”这类呼语前缀
function cleanNameCandidate(s) {
  let t = String(s || "").trim();
  t = t.replace(new RegExp(SENTENCE_BREAK + "+$"), "");
  // 去掉开头的呼语
  t = t.replace(
    new RegExp("^(请|烦请|望|希望)?[各班各系各院各寝室全体学生同学们]*[，,：:]?"),
    ""
  );
  return t.trim();
}

// 从“提交/报送/交到…”这类动词处截取名称
const NAME_VERB_RE = new RegExp(
  "(提交|报送|上交|递交|缴纳|填写|办理|领取|归还|补交|报名|参加|出席|到场|签到|参加)"
);

// 活动名词白名单
const EVENT_NOUNS = [
  "评审会", "初赛", "复赛", "决赛", "比赛", "讲座", "报告会", "典礼",
  "开幕式", "培训", "演练", "检查", "抽查", "验收", "答辩", "体检", "会议",
];

function pickEventNoun(text) {
  // 长名词优先
  const sorted = EVENT_NOUNS.slice().sort((a, b) => b.length - a.length);
  for (let i = 0; i < sorted.length; i++) {
    if (text.indexOf(sorted[i]) !== -1) return sorted[i];
  }
  return null;
}

function buildName(isSubmit, materials, sentenceText, kind) {
  const text = sentenceText == null ? "" : String(sentenceText);

  if (isSubmit) {
    // 手续类：提交 + 材料名
    if (Array.isArray(materials) && materials.length > 0) {
      return "提交" + materials[0];
    }
    if (text.indexOf("报名") !== -1) return "提交报名表";
    if (text.indexOf("领取") !== -1) return "领取材料";
    return "提交材料";
  }

  // 活动类
  const noun = pickEventNoun(text);
  if (noun) {
    if (text.indexOf("配合") !== -1 || text.indexOf("接受") !== -1) {
      return "配合" + noun;
    }
    return "参加" + noun;
  }
  if (text.indexOf("配合") !== -1 || text.indexOf("接受") !== -1) {
    return "配合活动";
  }
  return "参加活动";
}

// ---------- 时间合法性 ----------

const TIME_RE = new RegExp("^([01][0-9]|2[0-3]):[0-5][0-9]$");

function isLegalTime(t) {
  if (t == null) return true;
  return TIME_RE.test(String(t));
}

// 动作词（地点里混进这些就存疑）
const LOCATION_BAD_WORDS = [
  "报送", "提交", "交到", "交至", "递交", "上交", "缴纳", "填写",
  "办理", "领取", "报名", "参加", "签到",
];

function locationHasActionWord(loc) {
  if (!loc) return false;
  return containsAny(String(loc), LOCATION_BAD_WORDS);
}

// ---------- 相对日期判定 ----------

function isRelativeDateText(t) {
  if (!t) return false;
  const s = String(t).trim();
  if (!s) return false;
  // 明确相对说法：今天/明天/后天/周几/本月底/下月初/X天后 之类
  const relWords = [
    "今天", "明天", "后天", "大后天", "次日", "隔天", "即日",
    "下周", "本周", "这周", "下下", "下个", "这个", "下周", "本星期",
    "本月底", "本月末", "本月初", "下月底", "下月末", "下月初",
    "本月", "下月",
  ];
  if (containsAny(s, relWords)) return true;
  if (new RegExp("^[0-9一二三四五六七八九十两]+(天|日|周|个星期|个月|年)(内|后|之内|之后|以后)").test(s)) {
    return true;
  }
  return false;
}

// ---------- 日期与时间赋值 ----------

function toDateText(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  return s ? s : null;
}

// 把日期原文写法 + 基准日期 折算成展示日期（字符串）和 dateStatus
// 返回 { date, dateStatus }
function resolveDateDisplay(dateText, publishedAt) {
  if (!dateText) {
    return { date: null, dateStatus: "not_mentioned" };
  }

  const norm = normalizeChineseDate(dateText);

  // 含有明确年月日：直接当展示值
  const hasFullYear = new RegExp("[0-9]{4}年").test(norm);
  if (hasFullYear && !isRelativeDateText(norm)) {
    return { date: norm, dateStatus: "ok" };
  }

  // 相对说法
  if (isRelativeDateText(norm)) {
    if (!publishedAt) {
      // 没有基准：保留原文词，标待确认
      return { date: dateText, dateStatus: "pending" };
    }
    const base = publishedAt instanceof Date ? publishedAt : new Date(publishedAt);
    if (isNaN(base.getTime())) {
      return { date: dateText, dateStatus: "pending" };
    }
    const r = resolveRelativeDate(norm, base);
    if (r && r.normalized) {
      return { date: r.normalized, dateStatus: "ok" };
    }
    // 换算不出来：保留原文并标待确认
    return { date: dateText, dateStatus: "pending" };
  }

  // 只有月日
  const md = norm.match(new RegExp("^([0-9]{1,2})月([0-9]{1,2})[日号]?$"));
  if (md) {
    return { date: norm, dateStatus: "ok" };
  }

  // 其他情况：原文保留，交给校验判断
  return { date: norm, dateStatus: "ok" };
}

// ---------- 主构建 ----------

function buildKey(name, date, time, seq) {
  return [name, date || "", time || "", seq].join("|");
}

function isSubmitKind(kind) {
  return kind === "submit";
}

export function buildItems(rawText, options) {
  const text = rawText == null ? "" : String(rawText);
  const opts = options || {};
  const publishedAt = opts.publishedAt;

  if (!text.trim()) return [];

  // 抽取整体信息（材料、地点、面向对象等作为兜底参考）
  let notice = null;
  try {
    notice = extractNotice(text);
  } catch (e) {
    notice = null;
  }

  const sentences = splitSentences(text);
  const items = [];
  let seq = 0;

  for (let si = 0; si < sentences.length; si++) {
    const sentence = sentences[si];
    const kind = classifySentence(sentence);

    if (!kind) continue;

    const isSubmit = isSubmitKind(kind);
    const timeType = isSubmit ? "deadline" : "start";
    const timeTypeLabel = isSubmit ? "办理截止" : "开始时间";

    // ---- 先对本句调用抽取模块，拿到真实值 ----
    let local = null;
    try {
      local = extractNotice(sentence.text);
    } catch (e) {
      local = null;
    }
    if (!local) continue;

    // ---- 选日期：手续取截止日期，活动取活动日期，互相兜底 ----
    let dateRaw = isSubmit
      ? (local.deadline || local.eventDate)
      : (local.eventDate || local.deadline);
    // ---- 选时间：手续取 time，活动取 eventTime，互相兜底 ----
    let timeRaw = isSubmit
      ? (local.time || local.eventTime)
      : (local.eventTime || local.time);
    // ---- 地点 / 材料 / 面向对象 都取本句的 ----
    const locRaw = local.location || null;
    const matsRaw =
      isSubmit && Array.isArray(local.materials) ? local.materials : [];

    dateRaw = dateRaw == null ? null : String(dateRaw).trim();
    timeRaw = timeRaw == null ? null : String(timeRaw).trim();

    // ---- 一句里一个日期都抽不出来：不生成事项 ----
    if (!dateRaw) continue;

    // ---- 相对日期换算，无基准保留原文并待确认 ----
    const resolvedDate = resolveDateDisplay(dateRaw, publishedAt);

    // ---- 交给依据模块反查定位（此时目标都是真实值） ----
    const evidence = buildItemEvidence(text, sentence, {
      date: resolvedDate.dateStatus === "ok" ? resolvedDate.date : null,
      dateText: dateRaw,
      time: timeRaw || null,
      location: locRaw,
      materials: matsRaw,
    });

    // 时间：以抽取值为准，配上的依据引用取 evidence 里的 quote
    let time = timeRaw || null;
    let dateText = dateRaw;

    // 地点：以抽取值为准
    let location = locRaw || null;

    // 材料：仅手续类
    let materials = [];
    if (isSubmit && matsRaw.length > 0) {
      materials = matsRaw.slice();
    }

    // 面向对象
    let audience = null;
    if (local.audience) {
      audience = local.audience;
    } else if (notice && notice.audience) {
      audience = notice.audience;
    }

    const name = buildName(isSubmit, materials, sentence.text, kind);

    const item = {
      key: buildKey(name, resolvedDate.date, time, seq),
      seq: seq,
      name: name,
      kind: kind,
      timeType: timeType,
      timeTypeLabel: timeTypeLabel,
      date: resolvedDate.date,
      dateText: dateText || null,
      time: time,
      location: location,
      materials: materials,
      audience: audience,
      progress: "待办理",
      dateStatus: resolvedDate.dateStatus,
      evidence: evidence || null,
      status: {
        date: resolvedDate.dateStatus,
        time: time ? "ok" : "not_mentioned",
        location: location ? "ok" : (isSubmit ? "not_mentioned" : "not_mentioned"),
        materials: isSubmit
          ? (materials.length > 0 ? "ok" : "not_mentioned")
          : "not_applicable",
        audience: audience ? "ok" : "not_mentioned",
      },
      _issues: [],
      _complete: true,
    };

    // 存疑初判：时间不合法、日期进不了日历
    if (item.time && !isLegalTime(item.time)) {
      item.status.time = "failed";
      item._issues.push("时间格式不合法：" + item.time);
    }

    if (item.date) {
      const d = buildDeadlineDate(item.date, item.time);
      if (!d && item.dateStatus === "ok") {
        item.status.date = "failed";
        item._issues.push("日期无法进入日历：" + item.date);
      }
    }

    if (item.location && locationHasActionWord(item.location)) {
      item.status.location = "failed";
      item._issues.push("地点疑似混入动作词：" + item.location);
    }

    if (item._issues.length > 0) {
      item._complete = false;
    }

    items.push(item);
    seq++;
  }

  return items;
}

// ---------- 语义校验 ----------

export function validateItems(items, text) {
  const arr = Array.isArray(items) ? items : [];
  const fullText = text == null ? "" : String(text);

  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (!item || typeof item !== "object") continue;

    item._issues = [];
    if (!item.status || typeof item.status !== "object") {
      item.status = {};
    }
    const manual = item._manual === true;

    // ---------- 1) 时间合法性 ----------
    if (item.time != null && item.time !== "") {
      if (!isLegalTime(item.time)) {
        item.status.time = "failed";
        item._issues.push("时间不是合法的二十四小时制：" + item.time);
      }
    }

    // ---------- 2) 日期能否进日历 ----------
    if (item.date != null && item.date !== "") {
      const d = buildDeadlineDate(item.date, item.time);
      if (!d) {
        item.status.date = "failed";
        item._issues.push("日期无法进入日历：" + item.date);
      }
    }

    // ---------- 3) 地点是否混进动作词 ----------
    if (item.location) {
      if (locationHasActionWord(item.location)) {
        item.status.location = "failed";
        item._issues.push("地点疑似混入动作词：" + item.location);
      }
    }

    // ---------- 4) 依据核验（手动改过的跳过） ----------
    if (!manual) {
      const fields =
        item.evidence && item.evidence.fields ? item.evidence.fields : {};

      // 时间
      if (item.time != null && item.time !== "") {
        if (!fields.time) {
          item.status.time = "failed";
          item._issues.push("时间在原文中找不到依据");
        } else if (item.status.time === "ok") {
          item.status.time = "ok";
        }
      } else if (item.status.time !== "failed") {
        if (item.status.time !== "not_applicable") {
          item.status.time = "not_mentioned";
        }
      }

      // 日期：pending / failed / ok
      if (item.dateStatus === "pending" || item.status.date === "pending") {
        item.status.date = "pending";
        item.dateStatus = "pending";
      } else if (item.date != null && item.date !== "") {
        if (!fields.date) {
          item.status.date = "failed";
          item._issues.push("日期在原文中找不到依据");
        }
      }

      // 地点
      if (item.location != null && item.location !== "") {
        if (item.status.location !== "failed" && !fields.location) {
          item.status.location = "failed";
          item._issues.push("地点在原文中找不到依据");
        }
      } else if (item.status.location !== "failed") {
        item.status.location = "not_mentioned";
      }

      // 材料
      if (item.kind === "event" || item.kind === "activity") {
        item.status.materials = "not_applicable";
      } else if (Array.isArray(item.materials) && item.materials.length > 0) {
        if (
          item.status.materials !== "failed" &&
          !Array.isArray(fields.materials)
        ) {
          item.status.materials = "failed";
          item._issues.push("材料在原文中找不到依据");
        }
      } else if (item.status.materials !== "failed") {
        item.status.materials = "not_mentioned";
      }

      // 面向对象
      if (item.audience != null && item.audience !== "") {
        if (fullText && fullText.indexOf(item.audience) === -1) {
          item.status.audience = "failed";
          item._issues.push("面向对象在原文中找不到依据");
        }
      } else if (item.status.audience !== "failed") {
        item.status.audience = "not_mentioned";
      }
    }

    // ---------- 5) 汇总 ----------
    item._complete = item._issues.length === 0;
  }

  return arr;
}

export function applyItemPatch(items, patch) {
  const arr = Array.isArray(items) ? items : [];
  if (arr.length === 0) return arr;

  const p = patch && typeof patch === "object" ? patch : {};
  const hasEventDateKey = Object.prototype.hasOwnProperty.call(p, "eventDate");
  const hasEventTimeKey = Object.prototype.hasOwnProperty.call(p, "eventTime");
  const touchesEvent = hasEventDateKey || hasEventTimeKey;

  // 选目标事项
  let target = null;
  if (touchesEvent) {
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] && arr[i].timeType === "start") {
        target = arr[i];
        break;
      }
    }
  } else {
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] && arr[i].timeType === "deadline") {
        target = arr[i];
        break;
      }
    }
  }
  if (!target) target = arr[0];
  if (!target) return arr;

  const isEmptyVal = (v) =>
    v == null || (typeof v === "string" && v.trim() === "");

  if (!target.status || typeof target.status !== "object") {
    target.status = {};
  }

  // 日期类改动
  if (hasEventDateKey || Object.prototype.hasOwnProperty.call(p, "deadline")) {
    const dateVal = touchesEvent ? p.eventDate : p.deadline;
    if (isEmptyVal(dateVal)) {
      target.date = null;
      target.dateText = null;
      target.dateStatus = "not_mentioned";
      target.status.date = "not_mentioned";
    } else {
      const s = String(dateVal).trim();
      target.date = s;
      target.dateText = s;
      target.dateStatus = "ok";
      target.status.date = "ok";
    }
  }

  // 时间类改动
  if (hasEventTimeKey || Object.prototype.hasOwnProperty.call(p, "time")) {
    const timeVal = touchesEvent ? p.eventTime : p.time;
    if (isEmptyVal(timeVal)) {
      target.time = null;
      target.status.time = "not_mentioned";
    } else {
      const s = String(timeVal).trim();
      target.time = s;
      target.status.time = "ok";
    }
  }

  // 地点
  if (Object.prototype.hasOwnProperty.call(p, "location")) {
    if (isEmptyVal(p.location)) {
      target.location = null;
      target.status.location = "not_mentioned";
    } else {
      target.location = String(p.location).trim();
      target.status.location = "ok";
    }
  }

  // 材料
  if (Object.prototype.hasOwnProperty.call(p, "materials")) {
    if (isEmptyVal(p.materials)) {
      target.materials = [];
      target.status.materials =
        target.kind === "event" ? "not_applicable" : "not_mentioned";
    } else if (Array.isArray(p.materials)) {
      target.materials = p.materials.map((m) => String(m));
      target.status.materials =
        target.materials.length > 0 ? "ok" : "not_mentioned";
    } else {
      target.materials = [String(p.materials)];
      target.status.materials = "ok";
    }
  }

  // 面向对象
  if (Object.prototype.hasOwnProperty.call(p, "audience")) {
    if (isEmptyVal(p.audience)) {
      target.audience = null;
      target.status.audience = "not_mentioned";
    } else {
      target.audience = String(p.audience).trim();
      target.status.audience = "ok";
    }
  }

  // 手动标记
  target._manual = true;

  // 重新校验
  return validateItems(arr, "");
}
