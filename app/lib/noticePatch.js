// app/lib/noticePatch.js
// 识别“补充通知”里的变更点：判断一句话是不是变更句，抽出改了哪个字段、原值、新值、依据原句。
// 只做抽取，不改动原通知的事项；无法确定的地方一律记入 ambiguities，绝不猜。

import { parseNumber, normalizeTimePhrase } from "./evidence.js";
import { splitSentences } from "./noticeItems.js";

// ---------- 变更句判定 ----------

// 变更词表：出现任意一个，本句视为变更句
const PATCH_WORDS = [
  "调整到", "调整至", "调整", "改为", "改成", "变更",
  "推迟", "延后", "延期", "顺延", "提前", "改到", "改至",
  "取消", "不再", "撤销", "新增", "增加", "补充", "另行通知",
  "需提交", "还需交", "还要交", "需交", "还要提交", "需提供",
];

function containsAny(text, words) {
  for (let i = 0; i < words.length; i++) {
    if (text.indexOf(words[i]) !== -1) return true;
  }
  return false;
}

function firstIndexOfAny(text, words) {
  let best = -1;
  for (let i = 0; i < words.length; i++) {
    const idx = text.indexOf(words[i]);
    if (idx !== -1 && (best === -1 || idx < best)) best = idx;
  }
  return best;
}

// 补充后面跟这些词时，属于“补充通知”这类固定说法，不算变更词
const SUPPLEMENT_FOLLOW_WORDS = ["通知", "说明", "公告", "事项", "安排"];

// 收件说明里的不再只是说明逾期不收，不算变更词。
// 这是一组很窄的固定说法，不扩成通用动作词黑名单，免得误伤单位名。
const RECEIPT_NOT_WORDS = [
  "逾期不再",
  "过期不再",
  "不再受理",
  "不再接收",
  "不再接受",
];

// 只看不再前两字或后两字是否构成收件说明固定说法
function isReceiptNotPhrase(text, idx) {
  const s = String(text == null ? "" : text);
  const before2 = s.slice(Math.max(0, idx - 2), idx);
  const after2 = s.slice(idx + "不再".length, idx + "不再".length + 2);
  for (let i = 0; i < RECEIPT_NOT_WORDS.length; i++) {
    const w = RECEIPT_NOT_WORDS[i];
    if (w.indexOf("不再") === 0) {
      if (after2 === w.slice("不再".length)) return true;
    } else {
      if (before2 === w.slice(0, w.length - "不再".length)) return true;
    }
  }
  return false;
}

// 判断补充在 text 的补充位置是否属于固定说法
function isSupplementFixedPhrase(text, idx) {
  const after = String(text).slice(idx + "补充".length);
  for (let i = 0; i < SUPPLEMENT_FOLLOW_WORDS.length; i++) {
    if (after.indexOf(SUPPLEMENT_FOLLOW_WORDS[i]) === 0) return true;
  }
  return false;
}

// 补充通知这类固定说法里的补充不算变更词，收件说明里的不再也不算，
// 其余词出现即命中
function hasEffectivePatchWord(text) {
  const s = String(text == null ? "" : text);
  for (let i = 0; i < PATCH_WORDS.length; i++) {
    const w = PATCH_WORDS[i];
    if (w === "补充") {
      let from = 0;
      while (true) {
        const idx = s.indexOf("补充", from);
        if (idx === -1) break;
        if (!isSupplementFixedPhrase(s, idx)) return true;
        from = idx + "补充".length;
      }
      continue;
    }
    if (w === "不再") {
      let from = 0;
      while (true) {
        const idx = s.indexOf("不再", from);
        if (idx === -1) break;
        if (!isReceiptNotPhrase(s, idx)) return true;
        from = idx + "不再".length;
      }
      continue;
    }
    if (s.indexOf(w) !== -1) return true;
  }
  return false;
}

export function isPatchSentence(sentenceText) {
  const s = sentenceText == null ? "" : String(sentenceText);
  if (!s) return false;
  return hasEffectivePatchWord(s);
}

// ---------- 取消 / 其余不变 判定 ----------

const CANCEL_WORDS = ["取消", "不再举行", "不再举办", "撤销", "不再"];

const KEEP_OTHERS_WORDS = [
  "其余安排不变", "其他安排不变", "其余不变", "其他不变",
  "其余事项不变", "其他事项不变",
];

// ---------- 待定类说法 ----------

const PENDING_WORDS = ["另行通知", "待定", "暂定", "择期"];

// ---------- 日期抽取 ----------

// 中文数字映射，用于把 十一 转成 11
const CN_DIGITS = {
  "零": 0, "〇": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4,
  "五": 5, "六": 6, "七": 7, "八": 8, "九": 9,
};

function cnToInt(s) {
  const t = String(s == null ? "" : s).trim();
  if (!t) return null;
  if (new RegExp("^[0-9]+$").test(t)) return parseInt(t, 10);
  if (t === "十") return 10;
  // 十X / X十 / X十Y
  const m = t.match(new RegExp("^([一二两三四五六七八九])?十([一二三四五六七八九])?$"));
  if (m) {
    const tens = m[1] ? CN_DIGITS[m[1]] : 1;
    const ones = m[2] ? CN_DIGITS[m[2]] : 0;
    return tens * 10 + ones;
  }
  // 单字
  if (t.length === 1 && CN_DIGITS[t] != null) return CN_DIGITS[t];
  return null;
}

// 匹配 月/日 日期写法（中文或阿拉伯数字），返回原文位置和原文写法
// 支持：十一月八日 / 11月8日 / 11月8号 / 十一月八号
const DATE_ITEM_RE = new RegExp(
  "[0-9一二两三四五六七八九十]{1,3}月[0-9一二两三四五六七八九十]{1,3}[日号]",
  "g"
);

function findDates(text) {
  const out = [];
  const s = String(text == null ? "" : text);
  const re = new RegExp(DATE_ITEM_RE.source, "g");
  let m;
  while ((m = re.exec(s)) !== null) {
    out.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  return out;
}

// ---------- 时间抽取（复用 evidence.js 的 normalizeTimePhrase） ----------

// 时间候选：中文时间说法 / 二十四小时制
// 中文：晚上七点 / 下午五点 / 晚上六点半 / 十一点 / 七点半 / 十九点 / 十九点整 等
const TIME_ITEM_RE = new RegExp(
  "(上午|下午|中午|晚上|晚间|凌晨|早上|傍晚)?[0-9一二两三四五六七八九十]{1,3}[点:：]([0-9一二两三四五六七八九十]{1,2}分?|半|整)?",
  "g"
);

function findTimes(text) {
  const out = [];
  const s = String(text == null ? "" : text);
  const re = new RegExp(TIME_ITEM_RE.source, "g");
  let m;
  while ((m = re.exec(s)) !== null) {
    const raw = m[0];
    const norm = normalizeTimePhrase(raw);
    // 归一化成功才收，失败说明不是时间说法
    if (norm == null) continue;
    out.push({
      raw: raw,
      normalized: norm,
      start: m.index,
      end: m.index + raw.length,
    });
  }
  return out;
}

// ---------- 地点抽取 ----------

const LOCATION_VERB_WORDS = ["改动", "改到", "改至", "改为", "改成", "调整到", "调整至", "变更为", "变更到"];

// 取变更词后面的内容（去掉动词、去掉开头的 为/到/至/成、截到标点）。抽不到返回 null。
function sliceAfterLocationVerb(text, verbSearchStart) {
  const s = String(text == null ? "" : text);
  let verbIdx = -1;
  let verbLen = 0;
  for (let i = 0; i < LOCATION_VERB_WORDS.length; i++) {
    const w = LOCATION_VERB_WORDS[i];
    const idx = s.indexOf(w, verbSearchStart);
    if (idx !== -1 && (verbIdx === -1 || idx < verbIdx)) {
      verbIdx = idx;
      verbLen = w.length;
    }
  }
  if (verbIdx === -1) return null;

  let rest = s.slice(verbIdx + verbLen);
  rest = rest.replace(new RegExp("^[为到至成]+"), "");

  const stop = rest.search(new RegExp("[。；;，,！？!?]"));
  let loc = stop === -1 ? rest : rest.slice(0, stop);
  loc = loc.trim();
  loc = loc.replace(new RegExp("(举行|召开|进行|开会)$"), "").trim();
  return loc || null;
}

// 判断一段内容是不是纯日期或者纯时间
function isPureDateOrTime(seg) {
  const t = String(seg == null ? "" : seg)
    .replace(
      new RegExp(
        "[" + String.fromCharCode(32, 9, 10, 13, 12288) + "，,。；;！？!?]"
      ),
      ""
    )
    .trim();
  if (!t) return true;

  const ds = findDates(t);
  if (ds.length === 1 && ds[0].start === 0 && ds[0].end === t.length) return true;

  const ts = findTimes(t);
  if (ts.length === 1 && ts[0].start === 0 && ts[0].end === t.length) return true;

  // 日期连着时间，比如 十一月九日十九点
  if (ds.length === 1 && ts.length >= 1) {
    const d = ds[0];
    for (let i = 0; i < ts.length; i++) {
      const tm = ts[i];
      if (d.start === 0 && tm.end === t.length && tm.start >= d.end) return true;
      if (tm.start === 0 && d.end === t.length && d.start >= tm.end) return true;
    }
  }
  return false;
}

// 地点句：优先以“地点”二字为锚点，只在它后面找改动词
function extractLocation(text) {
  const s = String(text == null ? "" : text);
  if (!s) return null;

  const anchorIdx = s.indexOf("地点");
  if (anchorIdx !== -1) {
    const loc = sliceAfterLocationVerb(s, anchorIdx + "地点".length);
    if (loc) return { text: loc };
    return null;
  }

  // 整句没有地点二字：退一步找改动词，但内容是纯日期或纯时间就放弃
  const loc = sliceAfterLocationVerb(s, 0);
  if (!loc) return null;
  if (isPureDateOrTime(loc)) return null;
  return { text: loc };
}

// ---------- 材料抽取 ----------

const MATERIAL_VERB_WORDS = [
  "需提交", "还需交", "还要交", "需交", "还要提交", "需提供",
  "补充", "新增", "增加",
];

// 材料项过滤：长度小于两个字，或者本身就是空话的，不收
const MATERIAL_NOISE_WORDS = ["通知", "说明", "公告", "事项", "安排"];

function isNoiseMaterial(name) {
  const t = String(name == null ? "" : name).trim();
  if (t.length < 2) return true;
  for (let i = 0; i < MATERIAL_NOISE_WORDS.length; i++) {
    if (t === MATERIAL_NOISE_WORDS[i]) return true;
  }
  return false;
}

// 找材料变更动词位置：补充需排除“补充通知”这类固定说法
function findMaterialVerb(text) {
  const s = String(text == null ? "" : text);
  let best = -1;
  let bestLen = 0;
  for (let i = 0; i < MATERIAL_VERB_WORDS.length; i++) {
    const w = MATERIAL_VERB_WORDS[i];
    if (w === "补充") {
      let from = 0;
      while (true) {
        const idx = s.indexOf("补充", from);
        if (idx === -1) break;
        if (!isSupplementFixedPhrase(s, idx)) {
          if (best === -1 || idx < best) {
            best = idx;
            bestLen = w.length;
          }
          break;
        }
        from = idx + "补充".length;
      }
      continue;
    }
    const idx = s.indexOf(w);
    if (idx !== -1 && (best === -1 || idx < best)) {
      best = idx;
      bestLen = w.length;
    }
  }
  if (best === -1) return null;
  return { idx: best, len: bestLen };
}

function extractMaterials(text) {
  const s = String(text == null ? "" : text);
  const hit = findMaterialVerb(s);
  if (!hit) return null;

  let rest = s.slice(hit.idx + hit.len);
  rest = rest.replace(new RegExp("^的"), "");

  const stop = rest.search(new RegExp("[。；;，,！？!?]"));
  let seg = stop === -1 ? rest : rest.slice(0, stop);
  seg = seg.trim();
  seg = seg.replace(new RegExp("^(新增|补充|增加)"), "").trim();

  if (!seg) return null;

  const rawParts = seg
    .split(new RegExp("[、，,]|和|及|与"))
    .map((x) => x.trim())
    .filter((x) => x.length > 0);

  const parts = [];
  for (let i = 0; i < rawParts.length; i++) {
    if (isNoiseMaterial(rawParts[i])) continue;
    parts.push(rawParts[i]);
  }

  if (parts.length === 0) return null;
  return parts;
}

// ---------- 目标提示词 ----------

const TARGET_NOUNS = [
  "评审会", "复赛", "初赛", "决赛", "比赛", "讲座", "报告会",
  "典礼", "开幕式", "培训", "演练", "检查", "抽查", "验收",
  "答辩", "体检", "会议", "活动",
];

function extractTargetHint(text) {
  const s = String(text == null ? "" : text);
  const sorted = TARGET_NOUNS.slice().sort((a, b) => b.length - a.length);
  for (let i = 0; i < sorted.length; i++) {
    if (s.indexOf(sorted[i]) !== -1) return sorted[i];
  }
  return "";
}

// ---------- 主函数 ----------

export function buildNoticePatch(rawText) {
  const text = rawText == null ? "" : String(rawText);
  const emptyResult = {
    isPatch: false,
    changes: [],
    keepOthers: false,
    targetHint: "",
    ambiguities: [],
    rawText: text,
  };
  if (!text.trim()) return emptyResult;

  const sentences = splitSentences(text);
  const changes = [];
  const ambiguities = [];
  let isPatch = false;
  let keepOthers = false;
  let targetHint = "";

  for (let si = 0; si < sentences.length; si++) {
    const sentence = sentences[si];
    const sText = sentence.text;
    const sStart = sentence.start;

    // 其余不变
    if (containsAny(sText, KEEP_OTHERS_WORDS)) {
      keepOthers = true;
    }

    // 不是变更句：跳过
    if (!isPatchSentence(sText)) continue;
    isPatch = true;

    // 目标提示词（取第一个命中的）
    if (!targetHint) {
      const hint = extractTargetHint(sText);
      if (hint) targetHint = hint;
    }

    const quote = sText;
    const baseStart = sStart;

    // ---- 取消 ----
    const cancelIdx = firstIndexOfAny(sText, CANCEL_WORDS);
    const hasCancel = cancelIdx !== -1;

    // ---- 日期 ----
    const dates = findDates(sText);
    // ---- 时间 ----
    const times = findTimes(sText);

    // ---- 地点 ----
    const location = extractLocation(sText);
    // ---- 材料 ----
    const materials = extractMaterials(sText);

    // 先收集本句产生的变更
    const localChanges = [];

    // 取消
    if (hasCancel) {
      localChanges.push({
        field: "cancel",
        op: "cancel",
        from: null,
        to: null,
        quote: quote,
        start: baseStart,
        end: baseStart + quote.length,
      });
    }

    // 日期变更
    if (dates.length > 0) {
      const fromIdx = sText.indexOf("原定");
      if (fromIdx !== -1) {
        // 原定之后第一个日期是 from
        let fromDate = null;
        for (let i = 0; i < dates.length; i++) {
          if (dates[i].start >= fromIdx) {
            fromDate = dates[i];
            break;
          }
        }
        // 变更词之后第一个日期（且不是 from 那个）是 to
        const patchIdx = firstIndexOfAny(sText, PATCH_WORDS);
        let toDate = null;
        for (let i = 0; i < dates.length; i++) {
          if (fromDate && dates[i].start === fromDate.start) continue;
          if (patchIdx !== -1 && dates[i].start < patchIdx) continue;
          toDate = dates[i];
          break;
        }
        if (toDate) {
          localChanges.push({
            field: "date",
            op: "set",
            from: fromDate ? fromDate.text : null,
            to: toDate.text,
            quote: quote,
            start: baseStart,
            end: baseStart + quote.length,
          });
        } else {
          ambiguities.push("出现变更说法，但没找到新的日期");
        }
      } else {
        // 没有原定
        if (dates.length >= 2) {
          // 两个以上日期，确定不了哪个是新值
          // 仍尝试：变更词之后那个
          const patchIdx = firstIndexOfAny(sText, PATCH_WORDS);
          let toDate = null;
          if (patchIdx !== -1) {
            for (let i = 0; i < dates.length; i++) {
              if (dates[i].start >= patchIdx) {
                toDate = dates[i];
                break;
              }
            }
          }
          if (toDate) {
            localChanges.push({
              field: "date",
              op: "set",
              from: null,
              to: toDate.text,
              quote: quote,
              start: baseStart,
              end: baseStart + quote.length,
            });
          }
          ambiguities.push("一句话里出现多个日期，无法确定哪个是新的日期");
        } else if (dates.length === 1) {
          const patchIdx = firstIndexOfAny(sText, PATCH_WORDS);
          let toDate = null;
          if (patchIdx !== -1) {
            if (dates[0].start >= patchIdx) toDate = dates[0];
          } else {
            toDate = dates[0];
          }
          if (toDate) {
            localChanges.push({
              field: "date",
              op: "set",
              from: null,
              to: toDate.text,
              quote: quote,
              start: baseStart,
              end: baseStart + quote.length,
            });
          }
        }
      }
    }

    // 时间变更
    if (times.length > 0) {
      // 取一个时间作为新值：优先变更词之后的，否则第一个
      const patchIdx = firstIndexOfAny(sText, PATCH_WORDS);
      let toTime = null;
      if (patchIdx !== -1) {
        for (let i = 0; i < times.length; i++) {
          if (times[i].start >= patchIdx) {
            toTime = times[i];
            break;
          }
        }
      }
      if (!toTime) toTime = times[0];
      if (toTime) {
        localChanges.push({
          field: "time",
          op: "set",
          from: null,
          to: toTime.normalized,
          quote: quote,
          start: baseStart,
          end: baseStart + quote.length,
        });
      }
    }

    // 地点变更
    if (location) {
      localChanges.push({
        field: "location",
        op: "set",
        from: null,
        to: location.text,
        quote: quote,
        start: baseStart,
        end: baseStart + quote.length,
      });
    }

    // 材料变更
    if (materials) {
      localChanges.push({
        field: "materials",
        op: "add",
        from: null,
        to: materials,
        quote: quote,
        start: baseStart,
        end: baseStart + quote.length,
      });
    }

    // 歧义：有待定说法且本句没有具体值
    if (containsAny(sText, PENDING_WORDS)) {
      const hasConcrete =
        localChanges.length > 0 ||
        dates.length > 0 ||
        times.length > 0 ||
        location != null ||
        materials != null;
      if (!hasConcrete) {
        ambiguities.push("出现“" + firstPendingWord(sText) + "”，但没有给出具体的新时间或新地点");
      }
    }

    // 歧义：有变更词但抽不出任何新值
    if (localChanges.length === 0 && !containsAny(sText, PENDING_WORDS)) {
      ambiguities.push("这句话像是变更，但没抽到新的值，请核对原文");
    }

    for (let i = 0; i < localChanges.length; i++) {
      changes.push(localChanges[i]);
    }
  }

  return {
    isPatch: isPatch,
    changes: changes,
    keepOthers: keepOthers,
    targetHint: targetHint,
    ambiguities: ambiguities,
    rawText: text,
  };
}

function firstPendingWord(text) {
  for (let i = 0; i < PENDING_WORDS.length; i++) {
    if (text.indexOf(PENDING_WORDS[i]) !== -1) return PENDING_WORDS[i];
  }
  return "";
}

// ---------- 补充通知落地：匹配 / 对比 / 应用 ----------

// 深拷贝一个事项：材料逐项复制，_issues 数组也复制
function cloneNoticeItem(item) {
  const src = item == null ? {} : item;
  const copy = {};
  const keys = Object.keys(src);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (k === "materials") {
      const mats = Array.isArray(src.materials) ? src.materials : [];
      const newMats = [];
      for (let j = 0; j < mats.length; j++) {
        const m = mats[j] == null ? {} : mats[j];
        newMats.push({
          name: m.name == null ? "" : m.name,
          ready: m.ready === true,
        });
      }
      copy.materials = newMats;
    } else if (k === "_issues") {
      copy._issues = Array.isArray(src._issues) ? src._issues.slice() : [];
    } else if (Array.isArray(src[k])) {
      copy[k] = src[k].slice();
    } else {
      copy[k] = src[k];
    }
  }
  if (!Array.isArray(copy.materials)) copy.materials = [];
  return copy;
}

function patchTargetText(item) {
  return String(item && item.name != null ? item.name : "");
}

// 变更字段名 -> 中文说法
const FIELD_LABELS = {
  date: "日期",
  time: "时间",
  location: "地点",
  materials: "材料",
  cancel: "取消",
};

function fieldLabel(field) {
  return FIELD_LABELS[field] != null ? FIELD_LABELS[field] : String(field);
}

// 值转成给人看的字符串；materials 是数组
function valueToText(v) {
  if (v == null) return "";
  if (Array.isArray(v)) {
    const names = [];
    for (let i = 0; i < v.length; i++) {
      const m = v[i];
      names.push(m != null && m.name != null ? m.name : String(m));
    }
    return names.join("、");
  }
  return String(v);
}

export function matchPatchTarget(items, patch) {
  const list = Array.isArray(items) ? items : [];
  const hint = patch && patch.targetHint != null ? String(patch.targetHint) : "";
  const indexes = [];
  if (hint) {
    for (let i = 0; i < list.length; i++) {
      if (patchTargetText(list[i]).indexOf(hint) !== -1) indexes.push(i);
    }
  }
  return {
    indexes: indexes,
    needPick: indexes.length !== 1,
  };
}

export function buildPatchReview(items, patch, indexes) {
  const list = Array.isArray(items) ? items : [];
  const idxList = Array.isArray(indexes) ? indexes : [];
  const patchObj = patch == null ? {} : patch;
  const changes = Array.isArray(patchObj.changes) ? patchObj.changes : [];

  const matched = {};
  for (let i = 0; i < idxList.length; i++) matched[idxList[i]] = true;

  const rows = [];
  const alerts = [];

  for (let i = 0; i < idxList.length; i++) {
    const idx = idxList[i];
    const item = list[idx];
    if (!item) continue;
    const itemName = item.name == null ? "" : String(item.name);

    const itemChanges = [];
    for (let j = 0; j < changes.length; j++) {
      if (changes[j] && changes[j].field !== "cancel") itemChanges.push(changes[j]);
    }
    const hasCancel = (function () {
      for (let j = 0; j < changes.length; j++) {
        if (changes[j] && changes[j].field === "cancel") return true;
      }
      return false;
    })();

    if (hasCancel) {
      let cancelQuote = "";
      for (let j = 0; j < changes.length; j++) {
        if (changes[j] && changes[j].field === "cancel") {
          cancelQuote = changes[j].quote == null ? "" : String(changes[j].quote);
          break;
        }
      }
      rows.push({
        index: idx,
        itemName: itemName,
        field: "cancel",
        from: null,
        to: null,
        quote: cancelQuote,
        kind: "cancelled",
      });
      continue;
    }

    for (let j = 0; j < itemChanges.length; j++) {
      const ch = itemChanges[j];
      const field = ch.field;
      let fromVal = null;
      if (field === "date" || field === "time" || field === "location") {
        fromVal = item[field] == null ? null : item[field];
      } else if (field === "materials") {
        fromVal = null;
      }

      let kind = "changed";
      if (field === "date" || field === "time" || field === "location") {
        const before = fromVal == null ? "" : String(fromVal);
        const after = ch.to == null ? "" : String(ch.to);
        if (before === after) kind = "unchanged";
      }

      rows.push({
        index: idx,
        itemName: itemName,
        field: field,
        from: fromVal,
        to: ch.to,
        quote: ch.quote == null ? "" : String(ch.quote),
        kind: kind,
      });
    }
  }

  const untouched = [];
  for (let i = 0; i < list.length; i++) {
    if (matched[i]) continue;
    untouched.push({
      index: i,
      itemName: list[i] && list[i].name != null ? String(list[i].name) : "",
    });
  }

  return {
    rows: rows,
    untouched: untouched,
    alerts: alerts,
  };
}

export function applyPatch(items, patch, indexes, timestamp) {
  const list = Array.isArray(items) ? items : [];
  const idxList = Array.isArray(indexes) ? indexes : [];
  const patchObj = patch == null ? {} : patch;
  const changes = Array.isArray(patchObj.changes) ? patchObj.changes : [];

  const newItems = [];
  for (let i = 0; i < list.length; i++) newItems.push(cloneNoticeItem(list[i]));

  const alerts = [];
  const detail = [];
  const summaryParts = [];

  for (let k = 0; k < idxList.length; k++) {
    const idx = idxList[k];
    const item = newItems[idx];
    if (!item) continue;
    const itemName = item.name == null ? "" : String(item.name);

    const hasCancel = (function () {
      for (let j = 0; j < changes.length; j++) {
        if (changes[j] && changes[j].field === "cancel") return true;
      }
      return false;
    })();

    if (hasCancel) {
      item.cancelled = true;
      item.progress = "无需办理";
      let quote = "";
      for (let j = 0; j < changes.length; j++) {
        if (changes[j] && changes[j].field === "cancel") {
          quote = changes[j].quote == null ? "" : String(changes[j].quote);
          break;
        }
      }
      detail.push({
        field: "cancel",
        from: null,
        to: null,
        quote: quote,
      });
      alerts.push("“" + itemName + "”已取消，请同学核对。");
      summaryParts.push(itemName + "取消");
      continue;
    }

    for (let j = 0; j < changes.length; j++) {
      const ch = changes[j];
      if (!ch) continue;
      const field = ch.field;

      if (field === "date") {
        const before = item.date == null ? null : item.date;
        if (before === ch.to) continue;
        const wasDone = item.progress === "已办理";
        item.date = ch.to;
        item.dateText = ch.to;
        detail.push({
          field: "date",
          from: before,
          to: ch.to,
          quote: ch.quote == null ? "" : String(ch.quote),
        });
        summaryParts.push(itemName + "日期 " + valueToText(before) + " → " + valueToText(ch.to));
        if (wasDone) {
          alerts.push("“" + itemName + "”同学已标过完成，现在日期改了，请同学自己决定是否重新办理。");
        }
      } else if (field === "time") {
        const before = item.time == null ? null : item.time;
        if (before === ch.to) continue;
        const wasDone = item.progress === "已办理";
        item.time = ch.to;
        detail.push({
          field: "time",
          from: before,
          to: ch.to,
          quote: ch.quote == null ? "" : String(ch.quote),
        });
        summaryParts.push(itemName + "时间 " + valueToText(before) + " → " + valueToText(ch.to));
        if (wasDone) {
          alerts.push("“" + itemName + "”同学已标过完成，现在时间改了，请同学自己决定是否重新办理。");
        }
      } else if (field === "location") {
        const before = item.location == null ? null : item.location;
        if (before === ch.to) continue;
        item.location = ch.to;
        detail.push({
          field: "location",
          from: before,
          to: ch.to,
          quote: ch.quote == null ? "" : String(ch.quote),
        });
        summaryParts.push(itemName + "地点 " + valueToText(before) + " → " + valueToText(ch.to));
      } else if (field === "materials") {
        const names = Array.isArray(ch.to) ? ch.to : [];
        if (names.length === 0) continue;
        if (!Array.isArray(item.materials)) item.materials = [];
        const addedNames = [];
        for (let m = 0; m < names.length; m++) {
          item.materials.push({ name: names[m], ready: false });
          addedNames.push(names[m]);
        }
        detail.push({
          field: "materials",
          from: null,
          to: addedNames.slice(),
          quote: ch.quote == null ? "" : String(ch.quote),
        });
        summaryParts.push(itemName + "新增材料 " + addedNames.join("、"));
        if (addedNames.length > 0) {
          alerts.push("“" + itemName + "”新增了材料 " + addedNames.join("、") + "，需要单独准备。");
        }
      }
    }
  }

  const record = {
    time: timestamp == null ? "" : timestamp,
    summary: summaryParts.length > 0 ? summaryParts.join("；") : "补充通知未产生改动",
    changes: detail,
    rawText: patchObj.rawText == null ? "" : String(patchObj.rawText),
  };

  return {
    items: newItems,
    record: record,
    alerts: alerts,
  };
}
