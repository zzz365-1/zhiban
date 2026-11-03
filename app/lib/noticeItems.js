/**
 * 事项层：一条通知里往往不止一件事。
 *
 * 【为什么要有这一层】
 * 原来的数据是一条通知一份字段，截止日期 活动日期 地点 材料各只有一个。
 * 可真实通知常常是两件事：五号前交表，八号开评审会。
 * 挤在一个字段里，地点只能留一个，交表的和开会的地点就串了。
 * 所以按句切分成事项，每个事项自己带时间类型 日期时间 地点 材料 对象 状态 原文依据。
 *
 * 【边界】
 * 只切句，不改原文。证据定位一律用原文偏移，界面拿到就能选中文框里的字。
 * 拿不准就留空并标原因，不许猜一个填上。
 */

import { extractNotice } from "./extractNotice.js";
import { normalizeChineseDate, resolveRelativeDate } from "./relativeDate.js";
import { buildDeadlineDate } from "./deadline.js";
import { buildItemEvidence } from "./evidence.js";

// 句子的边界。逗号不算，报名截止时间为某日某时，报名表交到某处 是一件事。
const SENTENCE_END = new RegExp("[。；;！？!?\\n]");

const SUBMIT_MARKERS = new RegExp(
  "截止|前将|前交|前报|前提交|前报送|报送|提交|上交|递交|交到|交至|交于|交给|" +
    "报名|领取|上报|回执|申请|填写|缴|补交|汇总至"
);

const EVENT_MARKERS = new RegExp(
  "举行|举办|召开|开始|开赛|进行|开幕|启动|上课|开课|讲座|初赛|复赛|决赛|" +
    "比赛|评审会|会议|典礼|培训|演练|检查|抽查|签到|到场|出席|验收|答辩|体检"
);

const FUZZY_DATE = new RegExp(
  "今天|明天|后天|大后天|昨日|昨天|下周|本周|这周|上周|下月|本月|下个?星期|" +
    "星期[一二三四五六日天]|周[一二三四五六日天]|几天后|半个月后|月底|月初|日前"
);

export function splitSentences(text) {
  const list = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (SENTENCE_END.test(text.charAt(i))) {
      if (i > start) list.push({ text: text.slice(start, i), start });
      start = i + 1;
    }
  }
  if (start < text.length) {
    list.push({ text: text.slice(start), start });
  }
  return list.filter((s) => s.text.trim().length > 0);
}

// 这一句说的是要办的手续，还是一场要参加的活动。
export function classifySentence(sentence) {
  const isSubmit = SUBMIT_MARKERS.test(sentence);
  const isEvent = EVENT_MARKERS.test(sentence);
  if (isSubmit) return "submit";
  if (isEvent) return "event";
  return null;
}

function buildItemName(kind, sentence, materials) {
  if (kind === "submit") {
    if (materials && materials.length > 0) return "提交" + materials[0];
    if (new RegExp("报名").test(sentence)) return "报名";
    if (new RegExp("领取").test(sentence)) return "领取";
    return "提交材料";
  }
  const nounMatch = sentence.match(
    new RegExp(
      "(评审会|初审会|说明会|动员会|推进会|座谈会|例会|会议|初赛|复赛|决赛|比赛|" +
        "讲座|报告会|典礼|开幕式|培训班|培训|演练|检查|抽查|验收|答辩|体检)"
    )
  );
  const noun = nounMatch ? nounMatch[1] : "活动";
  const verb = new RegExp("配合|接受").test(sentence) ? "配合" : "参加";
  return verb + noun;
}

// 状态分四种，不许都写成未识别。
//   ok            有值，原文里也找得到依据
//   not_mentioned 这类事项通常有，但这一句没写
//   not_applicable 这类事项本来就没有这个字段
//   pending       值依赖通知发布日期，还没有基准，需要用户确认
//   failed        有值但原文里找不到依据，或者有错，不能当真
function fieldStatus(kind, field, value, evidence) {
  if (kind === "event" && field === "materials") return "not_applicable";
  if (kind === "event" && field === "deadline") return "not_applicable";
  if (value === null || value === undefined || value === "") {
    return "not_mentioned";
  }
  if (evidence === null || evidence === undefined) return "failed";
  return "ok";
}

/**
 * 从一条通知原文里抽出事项。
 *
 * options:
 *   publishedAt  通知发布日期（Date 或时间戳）。相对日期靠它换算。
 *                没给的时候相对日期不换算，标成待确认，不许默默按今天算。
 *   now          兜底基准，仅在给了 publishedAt 之外用于别处
 */
export function buildItems(rawText, options) {
  const opt = options || {};
  const publishedAt = opt.publishedAt ? new Date(opt.publishedAt) : null;
  const text = String(rawText || "");
  if (!text.trim()) return [];

  const sentences = splitSentences(text);
  const items = [];
  let seq = 0;

  for (const sentence of sentences) {
    const kind = classifySentence(sentence.text);
    if (!kind) continue;

    const work = normalizeChineseDate(sentence.text);
    const r = extractNotice(work);

    const rawDate = kind === "submit" ? r.deadline || r.eventDate : r.eventDate || r.deadline;
    if (!rawDate) continue;

    let date = rawDate;
    let dateStatus = "ok";
    const fuzzy = FUZZY_DATE.test(rawDate);

    if (fuzzy) {
      if (publishedAt) {
        const resolved = resolveRelativeDate(rawDate, publishedAt);
        if (resolved) {
          date = resolved.normalized;
        } else {
          dateStatus = "failed";
        }
      } else {
        // 没有发布日期就没有基准。原样留着并标待确认，界面提示用户补发布日期。
        date = rawDate;
        dateStatus = "pending";
      }
    }

    const time = kind === "submit" ? r.time || r.eventTime : r.eventTime || r.time;

    const item = {
      key: "",
      seq: seq++,
      name: buildItemName(kind, sentence.text, r.materials),
      kind,
      timeType: kind === "submit" ? "deadline" : "start",
      timeTypeLabel: kind === "submit" ? "办理截止" : "开始时间",
      date,
      dateText: rawDate,
      time: time || null,
      location: r.location || null,
      materials: kind === "submit" ? r.materials || [] : [],
      audience: r.audience || null,
      progress: "待办理",
      dateStatus,
      evidence: null,
    };

    item.evidence = buildItemEvidence(text, sentence, item);
    item.key = [item.name, item.date, item.time || "", item.seq].join("|");

    items.push(item);
  }

  return validateItems(items, text);
}

/**
 * 字段和语义校验。本地规则和模型结果都要过这一关。
 *
 * 填满了不等于对。这里查的是语义有没有毛病：
 * 时间是不是合法时刻，日期能不能进日历，地点里有没有混进动作，
 * 值在原文里到底找不找得到依据。
 */
export function validateItems(items, text) {
  for (const item of items) {
    const issues = [];

    if (item.time && !new RegExp("^([01][0-9]|2[0-3]):[0-5][0-9]$").test(item.time)) {
      issues.push("时间写法不合法：" + item.time);
    }

    if (item.dateStatus === "ok" && item.date) {
      const d = buildDeadlineDate(item.date, item.time);
      if (!d) issues.push("日期进不了日历：" + item.date);
    }

    if (item.location && new RegExp("报送|提交|截止|上交|递交").test(item.location)) {
      issues.push("地点里混进了动作词：" + item.location);
    }

    const ev = item.evidence || { fields: {} };
    const f = ev.fields || {};

    const skipEvidence = Boolean(item._manual);

    if (!skipEvidence && item.dateStatus === "ok" && item.date && !f.date) {
      issues.push("日期在原文里找不到依据");
      item.dateStatus = "failed";
    }
    if (!skipEvidence && item.time && !f.time) {
      issues.push("时间在原文里找不到依据");
    }

    item._issues = issues;
    item._complete = issues.length === 0;

    item.status = {
      date: item.dateStatus,
      time: fieldStatus(item.kind, "time", item.time, f.time),
      location: fieldStatus(item.kind, "location", item.location, f.location),
      materials:
        item.kind === "event"
          ? "not_applicable"
          : fieldStatus(item.kind, "materials", item.materials, f.materials),
      // 面向对象是从称呼里认出来的，不要求每一个字都能定位，
      // 有就是有，没有就是这句没提，不能因为没存依据就判存疑。
      audience: item.audience ? "ok" : "not_mentioned",
    };
  }
  return items;
}

/**
 * 手动改字段之后同步事项。
 *
 * 手动改的值是人填的，原文里本来就没有，不能因为找不到依据就标成存疑。
 * 所以手动改过的项打上 _manual，校验时跳过找依据那一关，别的检查照旧。
 */
export function applyItemPatch(items, patch) {
  if (!Array.isArray(items) || items.length === 0) return items;
  if (!patch || typeof patch !== "object") return items;

  const out = items.map((it) => ({ ...it }));
  let touched = false;

  const eventPatch =
    patch.eventDate !== undefined || patch.eventTime !== undefined;
  const target =
    out.find((it) => (eventPatch ? it.timeType === "start" : it.timeType === "deadline")) ||
    out[0];

  const setManual = (item, key) => {
    item._manual = true;
    touched = true;
    return key;
  };

  if (patch.deadline !== undefined && target) {
    target.date = patch.deadline || null;
    target.dateText = patch.deadline || null;
    target.dateStatus = patch.deadline ? "ok" : "not_mentioned";
    setManual(target);
  }
  if (patch.eventDate !== undefined && target) {
    target.date = patch.eventDate || null;
    target.dateText = patch.eventDate || null;
    target.dateStatus = patch.eventDate ? "ok" : "not_mentioned";
    setManual(target);
  }
  if (patch.time !== undefined && target) {
    target.time = patch.time || null;
    setManual(target);
  }
  if (patch.eventTime !== undefined && target) {
    target.time = patch.eventTime || null;
    setManual(target);
  }
  if (patch.location !== undefined && target) {
    target.location = patch.location || null;
    setManual(target);
  }
  if (patch.materials !== undefined && target) {
    target.materials = Array.isArray(patch.materials) ? patch.materials : [];
    setManual(target);
  }
  if (patch.audience !== undefined && target) {
    target.audience = patch.audience || null;
    setManual(target);
  }

  return touched ? validateItems(out, "") : out;
}

// 事项状态的中文案。界面直接读这个，不许自己再写一套未识别。
export const STATUS_LABEL = {
  ok: "",
  not_mentioned: "原文未提及",
  not_applicable: "不适用",
  pending: "待确认",
  failed: "解析存疑",
};

export function statusLabel(s) {
  return STATUS_LABEL[s] || "";
}
