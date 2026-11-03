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
  // 第一轮自检补的：明确要动手做、但原来词表里没有的办事动词。
  // 真实踩过坑：实验室安全自查、毕业生图像采集这两类通知，
  // 整条通知一个事项都拆不出来，界面是空的，用户不知道要干什么。
  "自查", "自检", "整改", "排查", "核验", "复核", "登记", "采集", "携带",
  "上传", "申报", "备案", "复检", "补办", "补测", "补考",
];

// 活动类关键词：要去参加的事
const EVENT_WORDS = [
  "举行", "举办", "召开", "开始", "比赛", "讲座", "检查", "培训", "会议",
  "评审", "初赛", "决赛", "开赛", "开场", "开幕", "签到", "集合", "出发",
  // 第一轮自检补的：要到场参加的事。
  "体检", "演练", "考试", "笔试", "面试", "答辩", "宣讲会", "见面会",
  "参观", "观摩", "开班", "结业", "照相", "拍摄",
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

// ---------- 零事项兜底 ----------
//
// 【为什么要有这一段】
// 真实踩过坑：请各实验室对照检查表完成自查，发现问题及时整改。
// 这条通知明确要办事，但整条通知一个事项都没拆出来，界面是空的，
// 用户拿到手不知道自己要干什么。根因有两层，
// 一层是分类词表漏了自查这类词，另一层是主流程遇到抽不出日期的句子直接跳过。
// 补词表只能补到认识的词，补不完，所以再加一道兜底。
//
// 【兜底怎么才算安全】
// 只在整条通知一个事项都没有的时候才走；只认祈使和义务这两种明确要办事的写法；
// 抽不到的一律留空并标原文未提及，绝不猜。

// 办事动词字符类。一律字符类，不用反斜杠加数字。
const ACTION_VERB_CLASS =
  "[做办提交报填缴领还补自查整改排查核验复核登记携带来回上传申报备案]";

// 祈使式：请某某去做某事。中间允许任意字，只要求二十字内出现办事动词。
// 【为什么中间不限定称呼】试过只放行各班各系全体这类称呼，
// 请各实验室对照检查表完成自查这种一句都命中不了，兜底等于白加。
const POLITE_ACTION_RE = new RegExp(
  "请[^。；;！？]{0,20}(?:" +
    ACTION_VERB_CLASS +
    "|完成|开展|参加|落实|组织|配合|对照|准备|领取|报到|采集|体检|演练)"
);

// 义务式：须于、应于、务必、必须、要求某某完成。
const OBLIGATION_RE = new RegExp(
  "(须|需|应|务必|必须|一律)[于在]" +
    "|要求[各班各系各院各寝室全体同学学生，,：: ]{0,12}" +
    "(完成|提交|报送|参加|办理|自查|整改|核验|登记|采集)"
);

// 请于某日前这类，动词没命中也要认。
const PLEASE_BY_RE = new RegExp("请[于在].{0,12}(前|之前|以前|内)");

// 第三类认定：事件名词 + 同句带时间或地点。
// 真实踩过坑：学术讲座通知只有 时间/地点/欢迎广大师生参加，一句请、一句须于都没有，
// 兜底直接跳过，整条零事项。但讲座本身就是一件要去参加的事。
// 只认明确的事件名词，且必须同句还有时间或地点跟着，否则不造。
const EVENT_NOUN_FALLBACK = [
  "讲座", "报告会", "评审会", "开幕式", "典礼", "演出",
  "培训", "会议", "比赛",
];

// 时间线索：几点、点整、时分、上下午、年月日、周几、另行通知.
// 一律字符类，不用反斜杠加数字。
const FALLBACK_TIME_HINT = new RegExp(
  "([0-9一二三四五六七八九十两]+[点时]|[0-9一二三四五六七八九十两]+分" +
  "|上午|下午|中午|晚上|早上|凌晨" +
  "|[0-9一二三四五六七八九十两]+月[0-9一二三四五六七八九十两]+[日号]?" +
  "|[0-9]{4}年|周[一二三四五六日天]|星期[一二三四五六日天]|另行通知)"
);

// 地点线索：地点词 + 楼上/楼/厅/室/馆/场/中心/校区/在某某.
const FALLBACK_LOC_HINT = new RegExp(
  "(地点|在[^。；;！？]{0,20}" +
  "(楼|厅|室|馆|场|中心|校区|教室|报告厅))" +
  "|(楼|厅|室|馆|场|中心|校区|报告厅)"
);

// 第三类认定：服务动词 + 同句带地点或时间。
// 真实踩过坑：关于补办学生证的通知，只有 办理/需携带，没有请、没有须于，
// 兜底跳过，整条零事项。但补办本身就是要办的事。
const SERVICE_VERB_FALLBACK = [
  "办理", "受理", "开放", "领取", "补办", "申报",
];

function hasAnyWord(text, words) {
  for (let i = 0; i < words.length; i++) {
    if (text.indexOf(words[i]) !== -1) return true;
  }
  return false;
}

// 纯告知句式：荣获、特此通报、上线运行、放假安排这类，
// 有日期也不许造事项。真实三条纯告知都踩在这里。
// 【为什么不放 已于】已于在正常通知里太常见，比如报名已于11月1日开始，
// 放进来会误伤，而这三条纯告知已被下面别的词拦住，不需要它。
const PURE_NOTICE_RE = new RegExp(
  "(荣获|特此通报|特此通知|上线运行|欢迎使用|放假安排|放假时间)"
);

// 改期说法：原定某日某活动调整至另一日。
// 【为什么要有这一类】
// 真实踩过坑：关于2026年秋季校园招聘会双选会的补充通知，
// 原定11月15日9点00的双选会调整至11月18日14点30，地点改为体育馆主馆，其余安排不变。
// 抽取模块把日期时间地点全抽对了（11月18日 / 14点30 / 体育馆主馆），
// 但整条零事项，界面空白。原因：双选会不在事件名词表里，一句请也没有，一句须于也没有，
// 三类兜底全没中。而改期本身就是一件要办的事——用户必须按新时间去。
// 改期说法就那么几个固定词，比活动名词可靠得多，所以单独认一类。
// 【怎么才安全】整条里必须真的出现改期引导词，且改期日期之后必须真的抽得出日期。
// 纯告知三条不含改期说法，碰不到这里。
const RESCHEDULE_HINT = new RegExp(
  "(调整(?:至|到|为)|延期(?:至|到)|推迟(?:至|到)|顺延(?:至|到)|" +
    "改(?:为|至|到)|变更(?:为|至|到)|更新(?:为|至|到))"
);

// 整条里有没有改期说法，有才走改期认定。
function isRescheduleNotice(text) {
  const s = text == null ? "" : String(text);
  if (!s) return false;
  if (PURE_NOTICE_RE.test(s)) return false;
  return RESCHEDULE_HINT.test(s);
}

// 新增第三类：事件名词类 / 服务动词类。
// 两类都要求同句还有时间或地点跟着，否则不认，绝不勉强造。
function isNamedActionSentence(text) {
  const s = text == null ? "" : String(text);
  if (!s) return false;
  if (PURE_NOTICE_RE.test(s)) return false;

  const hasTime = FALLBACK_TIME_HINT.test(s);
  const hasLoc = FALLBACK_LOC_HINT.test(s);

  if (hasAnyWord(s, EVENT_NOUN_FALLBACK) && (hasTime || hasLoc)) {
    return true;
  }
  if (hasAnyWord(s, SERVICE_VERB_FALLBACK) && (hasTime || hasLoc)) {
    return true;
  }
  return false;
}

function isActionSentence(text) {
  const s = text == null ? "" : String(text);
  if (!s) return false;
  if (POLITE_ACTION_RE.test(s)) return true;
  if (PLEASE_BY_RE.test(s)) return true;
  if (OBLIGATION_RE.test(s)) return true;
  if (isNamedActionSentence(s)) return true;
  return false;
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

// ---------- 材料归一化 ----------

// 统一把材料整理成 [{ name, ready }]：
// - 字符串数组 → 每项补 ready:false
// - 对象数组   → 保留 name，ready 缺省补 false
// - 单项字符串 → 包成一项
// 不合法的项（无名字）丢弃。生成事项、读老数据都用这一个函数。
export function normalizeMaterials(materials) {
  const out = [];
  if (materials == null) return out;

  const list = Array.isArray(materials) ? materials : [materials];
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    if (m == null) continue;

    if (typeof m === "string") {
      const name = m.trim();
      if (!name) continue;
      out.push({ name: name, ready: false });
      continue;
    }

    if (typeof m === "object") {
      const name = m.name == null ? "" : String(m.name).trim();
      if (!name) continue;
      out.push({ name: name, ready: m.ready === true });
      continue;
    }

    // 数字等其他类型：当作名字
    const name = String(m).trim();
    if (!name) continue;
    out.push({ name: name, ready: false });
  }
  return out;
}

// ---------- 系统建议 ----------

export const SUGGESTION_SOURCE_SYSTEM = "system";

// 只用通用模板，绝不从原文取句子。
// 手续类：提醒提前把材料准备好、核对要求、别卡截止点。
// 活动类：提醒提前到场签到，明确不提准备材料。
function buildSuggestions(isSubmit, materials) {
  const out = [];
  const mats = Array.isArray(materials) ? materials : [];

  if (isSubmit) {
    if (mats.length > 0) {
      out.push({
        text: "提前把" + mats[0].name + "填写或准备好",
        source: SUGGESTION_SOURCE_SYSTEM,
      });
    } else {
      out.push({
        text: "提前把要提交的内容准备好",
        source: SUGGESTION_SOURCE_SYSTEM,
      });
    }
    out.push({
      text: "对照通知再核对一遍材料和份数要求",
      source: SUGGESTION_SOURCE_SYSTEM,
    });
    out.push({
      text: "尽量提前办理，别卡在截止时间",
      source: SUGGESTION_SOURCE_SYSTEM,
    });
  } else {
    out.push({
      text: "提前十分钟到场",
      source: SUGGESTION_SOURCE_SYSTEM,
    });
    out.push({
      text: "到场后按现场要求签到",
      source: SUGGESTION_SOURCE_SYSTEM,
    });
  }

  return out;
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
    // ---- 选结束时间：只有活动类要，手续类一律空 ----
    let endTimeRaw = isSubmit
      ? null
      : (local.eventEndTime || local.endTime);
    // ---- 地点 / 材料 / 面向对象 都取本句的 ----
    const locRaw = local.location || null;
    const matsRaw =
      isSubmit && Array.isArray(local.materials) ? local.materials : [];

    dateRaw = dateRaw == null ? null : String(dateRaw).trim();
    timeRaw = timeRaw == null ? null : String(timeRaw).trim();
    endTimeRaw = endTimeRaw == null ? null : String(endTimeRaw).trim();

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

    // 材料：仅手续类，统一归一化为对象数组
    let materials = [];
    if (isSubmit) {
      materials = normalizeMaterials(matsRaw);
    }

    const suggestions = buildSuggestions(isSubmit, materials);

    // 面向对象
    let audience = null;
    if (local.audience) {
      audience = local.audience;
    } else if (notice && notice.audience) {
      audience = notice.audience;
    }

    const name = buildName(
      isSubmit,
      materials.map((m) => m.name),
      sentence.text,
      kind
    );

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
      endTime: endTimeRaw || null,
      location: location,
      materials: materials,
      suggestions: suggestions,
      audience: audience,
      progress: "待办理",
      dateStatus: resolvedDate.dateStatus,
      evidence: evidence || null,
      status: {
        date: resolvedDate.dateStatus,
        time: time ? "ok" : "not_mentioned",
        endTime: endTimeRaw ? "ok" : "not_mentioned",
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

  // 兜底：整条通知一个事项都没拆出来，但原文里有明显要办事的说法。
  // 原来能正常分类的通知完全走原路径，这里一个字都碰不到。
  if (items.length === 0) {
    return buildFallbackItems(text, publishedAt, notice);
  }

  return items;
}

// 整条通知零事项时的兜底生成。
// 逐句找明显要办事的句子，抽多少算多少，抽不到的字段留空并标原文未提及。
// 日期抽不到也照样生成，因为一件没有写日期的事仍然是事，
// 界面上会显示待确认，比给用户一个空白页强。
function buildFallbackItems(text, publishedAt, notice) {
  const sentences = splitSentences(text);
  const items = [];
  let seq = 0;

  for (let si = 0; si < sentences.length; si++) {
    const sentence = sentences[si];
    if (!isActionSentence(sentence.text)) continue;

    let local = null;
    try {
      local = extractNotice(sentence.text);
    } catch (e) {
      local = null;
    }
    if (!local) local = {};

    const dateRaw = local.deadline || local.eventDate || null;
    const timeRaw = local.time || local.eventTime || null;
    const endTimeRaw = local.eventEndTime || local.endTime || null;
    const locRaw = local.location || null;
    const matsRaw = Array.isArray(local.materials) ? local.materials : [];

    const resolvedDate = dateRaw
      ? resolveDateDisplay(String(dateRaw).trim(), publishedAt)
      : { date: null, dateStatus: "not_mentioned" };

    const time = timeRaw == null ? null : String(timeRaw).trim() || null;
    const endTime = endTimeRaw == null ? null : String(endTimeRaw).trim() || null;
    const location = locRaw || null;
    const materials = normalizeMaterials(matsRaw);

    let audience = null;
    if (local.audience) audience = local.audience;
    else if (notice && notice.audience) audience = notice.audience;

    // 第三类认定进来的句子，事件名词类不能按“手续”起名，
    // 否则 讲座 会被叫成“提交材料”，跟实际对不上。
    const namedKind = hasAnyWord(sentence.text, EVENT_NOUN_FALLBACK) &&
      !hasAnyWord(sentence.text, SERVICE_VERB_FALLBACK)
      ? "event"
      : "submit";
    const isSubmit = namedKind === "submit";
    const name = buildName(
      isSubmit,
      materials.map((m) => m.name),
      sentence.text,
      namedKind
    );
    const evidence = buildItemEvidence(text, sentence, {
      date: resolvedDate.dateStatus === "ok" ? resolvedDate.date : null,
      dateText: dateRaw == null ? null : String(dateRaw).trim(),
      time: time,
      location: location,
      materials: matsRaw,
    });

    const item = {
      key: buildKey(name, resolvedDate.date, time, seq),
      seq: seq,
      name: name,
      kind: namedKind,
      timeType: isSubmit ? "deadline" : "start",
      timeTypeLabel: isSubmit ? "办理截止" : "开始时间",
      date: resolvedDate.date,
      dateText: dateRaw == null ? null : String(dateRaw).trim(),
      time: time,
      endTime: endTime,
      location: location,
      materials: isSubmit ? materials : [],
      suggestions: buildSuggestions(isSubmit, isSubmit ? materials : []),
      audience: audience,
      progress: "待办理",
      dateStatus: resolvedDate.dateStatus,
      evidence: evidence || null,
      status: {
        date: resolvedDate.dateStatus,
        time: time ? "ok" : "not_mentioned",
        endTime: endTime ? "ok" : "not_mentioned",
        location: location ? "ok" : "not_mentioned",
        materials: isSubmit
          ? (materials.length > 0 ? "ok" : "not_mentioned")
          : "not_applicable",
        audience: audience ? "ok" : "not_mentioned",
      },
      _issues: [],
      _complete: true,
      _fallback: true,
    };

    if (item.time && !isLegalTime(item.time)) {
      item.status.time = "failed";
      item._issues.push("时间格式不合法：" + item.time);
    }
    if (item.location && locationHasActionWord(item.location)) {
      item.status.location = "failed";
      item._issues.push("地点疑似混入动作词：" + item.location);
    }
    if (item._issues.length > 0) item._complete = false;

    items.push(item);
    seq++;
  }

  // 逐句都判不中，但整条里有改期说法：改期本身就是一件要办的事。
  // 这条通知双选会不在事件名词表里、没有请、没有须于，只有原定…调整至…
  // 改期日期和时间都用抽取模块抽到的调整后的值，不用作废的旧值。
  if (items.length === 0) {
    const resched = buildRescheduleItem(text, publishedAt, notice);
    if (resched) return [resched];
  }

  // 逐句都判不中，但整条里有事件名词、也有时间或地点：
  // 一行一个字段的写法（讲座 / 时间 / 地点 / 欢迎参加）很常见，
  // 这种整条再判一次，造一条事项。整条也判不中就还是零事项。
  if (items.length === 0) {
    const whole = buildWholeNoticeFallback(text, publishedAt, notice);
    if (whole) return [whole];
  }

  return items;
}

// ---------- 改期兜底 ----------
//
// 【为什么单独造一条】
// 原定11月15日9点00的双选会调整至11月18日14点30，地点改为体育馆主馆。
// 抽取模块对整条调用时，截止日期已经是调整后的 11月18日，时间 14点30，
// 活动时间同样是调整后的 14点30，作废的 9点00 已被改期逻辑挡在窗口外。
// 这里直接把这些抽到的值装成一条事项，不再按句分类，也不再拼词表。
//
// 【怎么才安全】
// 只在整条零事项时调用（调用处已保证）；
// 整条里必须真的出现改期说法；抽出的日期必须是调整后的那个，抽不到就不造；
// 纯告知三条不含改期说法，一条都碰不到。
function buildRescheduleItem(text, publishedAt, notice) {
  const s = text == null ? "" : String(text);
  if (!s) return null;
  if (!isRescheduleNotice(s)) return null;

  let local = null;
  try {
    local = extractNotice(s);
  } catch (e) {
    local = null;
  }
  if (!local) local = {};

  // 改期句：调整后的日期在抽取模块里落在 eventDate / deadline 上。
  // 两个都空说明改期日期没抽出来，宁可不造，也不拿作废日期顶上。
  const dateRaw = local.eventDate || local.deadline || null;
  if (!dateRaw) return null;

  const timeRaw = local.eventTime || local.time || null;
  const endTimeRaw = local.eventEndTime || local.endTime || null;
  const locRaw = local.location || null;

  const resolvedDate = resolveDateDisplay(String(dateRaw).trim(), publishedAt);

  const time = timeRaw == null ? null : String(timeRaw).trim() || null;
  const endTime = endTimeRaw == null ? null : String(endTimeRaw).trim() || null;
  const location = locRaw || null;

  let audience = null;
  if (local.audience) audience = local.audience;
  else if (notice && notice.audience) audience = notice.audience;

  // 名称：优先事件名词，没有再退回“按调整后时间参加”。
  const noun = pickEventNoun(s);
  const name = noun ? "参加" + noun : "按调整后时间参加活动";

  const evidence = buildItemEvidence(s, { text: s, start: 0 }, {
    date: resolvedDate.dateStatus === "ok" ? resolvedDate.date : null,
    dateText: String(dateRaw).trim(),
    time: time,
    location: location,
    materials: [],
  });

  const item = {
    key: buildKey(name, resolvedDate.date, time, 0),
    seq: 0,
    name: name,
    kind: "event",
    timeType: "start",
    timeTypeLabel: "开始时间",
    date: resolvedDate.date,
    dateText: String(dateRaw).trim(),
    time: time,
    endTime: endTime,
    location: location,
    materials: [],
    suggestions: buildSuggestions(false, []),
    audience: audience,
    progress: "待办理",
    dateStatus: resolvedDate.dateStatus,
    evidence: evidence || null,
    status: {
      date: resolvedDate.dateStatus,
      time: time ? "ok" : "not_mentioned",
      endTime: endTime ? "ok" : "not_mentioned",
      location: location ? "ok" : "not_mentioned",
      materials: "not_applicable",
      audience: audience ? "ok" : "not_mentioned",
    },
    _issues: [],
    _complete: true,
    _fallback: true,
    _rescheduleFallback: true,
  };

  if (item.time && !isLegalTime(item.time)) {
    item.status.time = "failed";
    item._issues.push("时间格式不合法：" + item.time);
  }
  if (item.location && locationHasActionWord(item.location)) {
    item.status.location = "failed";
    item._issues.push("地点疑似混入动作词：" + item.location);
  }
  if (item._issues.length > 0) item._complete = false;

  return item;
}

// ---------- 整条通知兜底 ----------
//
// 【为什么要有这一段】
// 真实踩过坑：学术讲座通知 / 时间 / 11月6日19点00 / 地点 / 图书馆三楼报告厅 /
// 欢迎广大师生参加。整条被切成四句，事件名词在第一句，时间在第二句，
// 地点在第三句，逐句判都不满足同句既有事件名词又有时间或地点，整条零事项。
// 但整条合起来看三样都齐。海报转过来的通知大量是这种一行一字段的写法。
//
// 【怎么才安全】
// 只在整条零事项时才走这一层（调用处已保证）；
// 事件名词、时间、地点都必须在整条原文里真实出现，抽不到的字段留空并标原文未提及；
// 纯告知三条必须拦住，一条都不能造出事项。

// 日期表达式：只在抽不出时用整条文本兜。时间线索已在 FALLBACK_TIME_HINT。
// 单独一条：X月X日[号]? 后可选时间。
const WHOLE_DATE_RE = new RegExp(
  "([0-9一二三四五六七八九十两]{1,4}月[0-9一二三四五六七八九十两]{1,3}[日号]?)"
);

// 时间表达式：X点[X分]，X:X 都认。取第一个。
// 空格一律用字符类，不用反斜杠加字母。
const WHOLE_TIME_RE = new RegExp(
  "([0-9一二三四五六七八九十两]{1,2}[ ]*[点时][ ]*[0-9一二三四五六七八九十两]{0,2}[ ]*分?" +
    "|[0-9]{1,2}:[0-9]{2})"
);

function buildWholeNoticeFallback(text, publishedAt, notice) {
  const s = text == null ? "" : String(text);
  if (!s) return null;

  // 纯告知必须拦住
  if (PURE_NOTICE_RE.test(s)) return null;

  // 整条里必须有事件名词，否则不认
  const noun = pickEventNoun(s);
  if (!noun) return null;

  const hasTime = FALLBACK_TIME_HINT.test(s);
  const hasLoc = FALLBACK_LOC_HINT.test(s);
  if (!hasTime && !hasLoc) return null;

  // 整条抠日期：先试抽取模块，抠不到再正则兜
  let local = null;
  try {
    local = extractNotice(s);
  } catch (e) {
    local = null;
  }
  if (!local) local = {};

  let dateRaw = local.eventDate || local.deadline || null;
  if (dateRaw == null) {
    const dm = s.match(WHOLE_DATE_RE);
    if (dm) dateRaw = dm[1];
  }

  let timeRaw = local.eventTime || local.time || null;
  if (timeRaw == null) {
    const tm = s.match(WHOLE_TIME_RE);
    if (tm) timeRaw = String(tm[1]).replace(new RegExp("[" + SPACE_CLASS + "]", "g"), "");
    // 19点00 归一成 19:00
    const hm = timeRaw && timeRaw.match(
      new RegExp("^([0-9一二三四五六七八九十两]{1,2})[点时]([0-9零一二三四五六七八九十]{0,2})分?$")
    );
    if (hm) {
      const hh = hm[1];
      const mmRaw = hm[2];
      const mm = mmRaw ? mmRaw : "00";
      const hhNum = hh.length === 1 ? "0" + hh : hh;
      const mmNum = mm.length === 1 ? "0" + mm : mm;
      timeRaw = hhNum + ":" + mmNum;
    }
  }
  timeRaw = timeRaw == null ? null : String(timeRaw).trim() || null;

  const endTimeRaw = local.eventEndTime || local.endTime || null;

  let location = local.location || null;
  if (!location) {
    // 从 地点 XX 或 XX楼/厅/室/馆/场/中心 抠
    // SPACE_CLASS 已含换行与回车，这里不必再单独写。
    const locLine = s.match(
      new RegExp("地点[：:，, ]?([^。；;！？" + SPACE_CLASS + "]{2,40})")
    );
    if (locLine) {
      location = locLine[1].trim() || null;
    } else {
      const locRough = s.match(
        new RegExp("([^。；;！？" + SPACE_CLASS + "]{2,20}(楼|厅|室|馆|场|中心|校区|教室|报告厅))")
      );
      if (locRough) location = locRough[1].trim() || null;
    }
  }
  if (location && locationHasActionWord(location)) {
    location = null;
  }

  const materials = [];
  let audience = null;
  if (local.audience) audience = local.audience;
  else if (notice && notice.audience) audience = notice.audience;

  const resolvedDate = dateRaw
    ? resolveDateDisplay(String(dateRaw).trim(), publishedAt)
    : { date: null, dateStatus: "not_mentioned" };

  const name = "参加" + noun;
  const evidence = buildItemEvidence(text, { text: s, start: 0 }, {
    date: resolvedDate.dateStatus === "ok" ? resolvedDate.date : null,
    dateText: dateRaw == null ? null : String(dateRaw).trim(),
    time: timeRaw,
    location: location,
    materials: materials,
  });

  const item = {
    key: buildKey(name, resolvedDate.date, timeRaw, 0),
    seq: 0,
    name: name,
    kind: "event",
    timeType: "start",
    timeTypeLabel: "开始时间",
    date: resolvedDate.date,
    dateText: dateRaw == null ? null : String(dateRaw).trim(),
    time: timeRaw,
    endTime: endTimeRaw == null ? null : String(endTimeRaw).trim(),
    location: location,
    materials: materials,
    suggestions: buildSuggestions(false, []),
    audience: audience,
    progress: "待办理",
    dateStatus: resolvedDate.dateStatus,
    evidence: evidence || null,
    status: {
      date: resolvedDate.dateStatus,
      time: timeRaw ? "ok" : "not_mentioned",
      endTime: endTimeRaw ? "ok" : "not_mentioned",
      location: location ? "ok" : "not_mentioned",
      materials: "not_applicable",
      audience: audience ? "ok" : "not_mentioned",
    },
    _issues: [],
    _complete: true,
    _fallback: true,
    _wholeFallback: true,
  };

  if (item.time && !isLegalTime(item.time)) {
    item.status.time = "failed";
    item._issues.push("时间格式不合法：" + item.time);
  }
  if (item.location && locationHasActionWord(item.location)) {
    item.status.location = "failed";
    item._issues.push("地点疑似混入动作词：" + item.location);
  }
  if (item._issues.length > 0) item._complete = false;

  return item;
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
        item.materials = normalizeMaterials(item.materials);
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
    } else {
      target.materials = normalizeMaterials(p.materials);
      target.status.materials =
        target.materials.length > 0 ? "ok" : "not_mentioned";
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
