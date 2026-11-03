/**
 * 原文依据：每个解析值都要能指回原文里它是从哪几个字来的。
 *
 * 【为什么要反查】
 * 界面上展示的是换算后的值，比如 17:00。原文的写法是下午5点。
 * 拿 17:00 去原文里搜是搜不到的，定位会失败，用户点依据没反应。
 * 所以时间这类换算值必须反着来：把原文里所有时间说法都算成 24 小时制，
 * 哪个算出来等于展示值，哪个就是依据。
 *
 * 【定位失败不许编】
 * 找不到就返回 null。宁可显示依据缺失，也不许随便指一处。
 * 这是防编造的一环，和出处核对是同一条原则。
 */

const CN_NUM = {
  零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5,
  六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};

function cnToNum(s) {
  if (!s) return null;
  if (/^[0-9]+$/.test(s)) return parseInt(s, 10);
  if (s === "十") return 10;
  if (s.length === 1 && CN_NUM[s] !== undefined) return CN_NUM[s];
  const m = s.match(/^(十|[二三四五六七八九]?)十([一二三四五六七八九])?$/);
  if (m) {
    const tens = m[1] === "十" ? 1 : CN_NUM[m[1]] || 0;
    const ones = m[2] ? CN_NUM[m[2]] : 0;
    return tens * 10 + ones;
  }
  const m2 = s.match(/^([二三四五六七八九])十([一二三四五六七八九])$/);
  if (m2) return CN_NUM[m2[1]] * 10 + CN_NUM[m2[2]];
  return null;
}

const SPAN_WORDS = "上午|下午|中午|晚上|凌晨|早上|早晨|傍晚|晚|早";

// 原文里所有像时间的说法。时和分都允许中文数字。
const TIME_PHRASE_RE = new RegExp(
  "(?:" + SPAN_WORDS + ")?[ ]*(?:([0-9]{1,2})|([一二三四五六七八九十两]{1,3}))[ ]*[点时]" +
    "(?:[ ]*(?:([0-9]{1,2})|([一二三四五六七八九十]{1,3}))[ ]*分?)?(?:[ ]*(半))?",
  "g"
);

const HHMM_RE = new RegExp("([0-9]{1,2})[ ]*[:：][ ]*([0-9]{2})", "g");

function pad(n) {
  return String(n).padStart(2, "0");
}

// 把一个时间说法算成 24 小时制的 HH:MM。算不出来返回 null。
export function normalizeTimePhrase(phrase) {
  if (!phrase) return null;
  const span = phrase.match(new RegExp("^(" + SPAN_WORDS + ")"));
  const spanWord = span ? span[1] : "";

  let hour = null;
  let minute = 0;

  const cn = phrase.match(
    new RegExp("([一二三四五六七八九十两]{1,3})[ ]*[点时]")
  );
  const ar = phrase.match(new RegExp("([0-9]{1,2})[ ]*[点时]"));
  if (ar) hour = parseInt(ar[1], 10);
  else if (cn) hour = cnToNum(cn[1]);

  const colon = phrase.match(new RegExp("([0-9]{1,2})[ ]*[:：][ ]*([0-9]{2})"));
  if (colon && hour === null) {
    hour = parseInt(colon[1], 10);
    minute = parseInt(colon[2], 10);
  }

  if (hour === null) return null;

  const minCn = phrase.match(
    new RegExp("[点时][ ]*([一二三四五六七八九十]{1,3})[ ]*分")
  );
  const minAr = phrase.match(new RegExp("[点时][ ]*([0-9]{1,2})[ ]*分"));
  if (minAr) minute = parseInt(minAr[1], 10);
  else if (minCn) minute = cnToNum(minCn[1]) || 0;
  if (/半/.test(phrase) && minute === 0) minute = 30;

  if (/(下午|晚上|傍晚|晚|中午|凌晨)/.test(spanWord) && hour < 12) hour += 12;
  if (/凌晨/.test(spanWord) && hour === 12) hour = 0;

  if (hour > 23 || minute > 59) return null;
  return pad(hour) + ":" + pad(minute);
}

// 在指定范围里找算出来说法等于目标值的时间短语，返回原文位置。
export function findTimePhrase(scope, target, offset) {
  if (!scope || !target) return null;
  const list = [];

  let m;
  TIME_PHRASE_RE.lastIndex = 0;
  while ((m = TIME_PHRASE_RE.exec(scope)) !== null) {
    if (!m[0]) break;
    list.push({ text: m[0], start: m.index });
  }
  HHMM_RE.lastIndex = 0;
  while ((m = HHMM_RE.exec(scope)) !== null) {
    list.push({ text: m[0], start: m.index });
  }

  // 长的优先，下午5点比5点更像依据
  list.sort((a, b) => b.text.length - a.text.length);
  for (const it of list) {
    if (normalizeTimePhrase(it.text) === target) {
      return {
        value: target,
        quote: it.text,
        start: (offset || 0) + it.start,
        end: (offset || 0) + it.start + it.text.length,
      };
    }
  }
  return null;
}

// 日期依据。展示值可能是 2026年11月5日，原文写的是 11月5日。
export function findDatePhrase(scope, target, offset) {
  if (!scope || !target) return null;
  const candidates = [target];
  const stripped = target.replace(new RegExp("^[0-9]{4}年"), "");
  if (stripped !== target) candidates.push(stripped);
  candidates.push(stripped.replace(/年|月|日/g, ""));

  for (const c of candidates) {
    const idx = scope.indexOf(c);
    if (idx !== -1) {
      return {
        value: target,
        quote: c,
        start: (offset || 0) + idx,
        end: (offset || 0) + idx + c.length,
      };
    }
  }
  return null;
}

// 直接在范围里找原样的值，地点和材料用这个。
export function findPlainPhrase(scope, target, offset) {
  if (!scope || !target) return null;
  const t = String(target).trim();
  const idx = scope.indexOf(t);
  if (idx === -1) return null;
  return {
    value: t,
    quote: t,
    start: (offset || 0) + idx,
    end: (offset || 0) + idx + t.length,
  };
}

/**
 * 给一个事项生成原文依据。
 *
 * sentence 是事项所在的那一句，带 start 偏移量。
 * 定位一律在整篇原文的偏移上算，界面拿到就能直接选中文框里的字。
 */
export function buildItemEvidence(fullText, sentence, item) {
  const scope = sentence ? sentence.text : fullText;
  const offset = sentence ? sentence.start : 0;

  const fields = {};

  if (item.date) {
    fields.date = findDatePhrase(scope, item.dateText || item.date, offset);
  }
  if (item.time) {
    fields.time = findTimePhrase(scope, item.time, offset);
  }
  if (item.location) {
    fields.location = findPlainPhrase(scope, item.location, offset);
  }
  if (item.materials && item.materials.length > 0) {
    fields.materials = item.materials
      .map((w) => findPlainPhrase(scope, w, offset))
      .filter(Boolean);
  }

  return {
    quote: scope,
    start: offset,
    end: offset + scope.length,
    fields,
  };
}
