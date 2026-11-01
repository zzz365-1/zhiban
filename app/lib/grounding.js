/**
 * 出处核对：模型返回的值回原文找依据。
 *
 * 【为什么需要】
 * prompt 里写“不许编造”只是要求，不保证模型真的做到。
 * 用户实测：原文写“图书馆六楼研讨室”，模型返回“教务处一楼大厅”，
 * 系统照单全收、界面原样显示。用户以为是真的，白跑一趟。
 * 所以必须在模型值进入系统后加一道核对：回原文找，找到就留，找不到就去掉。
 *
 * 【核对策略：先精确后宽松】
 * - 精确匹配：值的每个字符都在原文里连续出现。位置可精确记录。
 * - 宽松匹配：归一化（全角转半角、去空白、中文数字转阿拉伯、去括号内容、
 *   去标点）后值能在归一化后的原文里找到。位置不精确，不记。
 * - 都找不到：拦下，记录到 _groundingDropped。
 *
 * 【为什么需要宽松匹配】
 * 真实场景：原文“图书馆六楼”，模型返回“图书馆6楼”。
 * 语义完全相同，如果只做精确匹配会误拦。
 * 类似情况还有：空格差异、括号说明、日期分隔符（年月日 vs 横杠斜杠）。
 * 这些必须通过，否则拦错了比拦漏了更糟。
 *
 * 【不核对的字段】
 * summary / title / category：模型组织出来的，不从原文抄。
 * 本地已换算的日期（_locallyResolved）：本身就是原文相对说法的换算结果，
 * 不在原文里字面存在，但正确。
 */

const STRIP_PUNCT = "，。！？；：、,.;:!?\"'`《》<>()（）【】[]{}<>-=~/";
const CN_DIGIT_MAP = {
  零: "0", 〇: "0",
  一: "1", 二: "2", 两: "2", 三: "3", 四: "4",
  五: "5", 六: "6", 七: "7", 八: "8", 九: "9",
};

function toHalfWidth(s) {
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0);
    if (code >= 0xff01 && code <= 0xff5e) {
      out += String.fromCharCode(code - 0xfee0);
    } else if (code === 0x3000) {
      out += " ";
    } else {
      out += ch;
    }
  }
  return out;
}

function stripWhitespace(s) {
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0);
    if (code === 32 || code === 9 || code === 10 || code === 13 || code === 0x3000) {
      continue;
    }
    out += ch;
  }
  return out;
}

function normalizeChineseDigits(s) {
  let out = "";
  for (const ch of s) {
    out += ch in CN_DIGIT_MAP ? CN_DIGIT_MAP[ch] : ch;
  }
  return out;
}

function removeParenContent(s) {
  let out = "";
  let depth = 0;
  for (const ch of s) {
    if (ch === "（" || ch === "(") {
      depth++;
      continue;
    }
    if (ch === "）" || ch === ")") {
      if (depth > 0) depth--;
      continue;
    }
    if (depth === 0) out += ch;
  }
  return out;
}

function looseNormalize(s) {
  let t = toHalfWidth(String(s || ""));
  t = stripWhitespace(t);
  t = normalizeChineseDigits(t);
  t = removeParenContent(t);
  let out = "";
  for (const ch of t) {
    if (STRIP_PUNCT.includes(ch)) continue;
    out += ch;
  }
  return out.toLowerCase();
}

/**
 * 从字符串提取“月-日”结构。用于日期字段的宽容比对。
 * 支持：
 *   2026年11月15日 / 11月15日 / 11月15号
 *   2026-11-15 / 2026/11/15 / 11-15 / 11/15
 * 返回 "11-15" 或 null。
 */
export function extractMonthDay(s) {
  const t = toHalfWidth(String(s || ""));

  const m1 = t.match(/([0-9]+)月([0-9]+)/);
  if (m1) {
    return parseInt(m1[1], 10) + "-" + parseInt(m1[2], 10);
  }

  const m2 = t.match(/([0-9]+)[-/]([0-9]+)/);
  if (m2) {
    return parseInt(m2[1], 10) + "-" + parseInt(m2[2], 10);
  }

  return null;
}

/**
 * 去原文里找值。先精确后宽松。
 * 返回 { accepted, position, mode }
 *   position: { start, end } 精确匹配的位置；宽松匹配时为 null
 */
export function findValueInSource(value, sourceText) {
  const v = String(value || "").trim();
  const src = String(sourceText || "");
  if (!v) return { accepted: false, position: null, mode: "none" };

  const exactIdx = src.indexOf(v);
  if (exactIdx !== -1) {
    return {
      accepted: true,
      position: { start: exactIdx, end: exactIdx + v.length },
      mode: "exact",
    };
  }

  const looseSrc = looseNormalize(src);
  const looseV = looseNormalize(v);
  if (looseV && looseSrc.includes(looseV)) {
    return { accepted: true, position: null, mode: "loose" };
  }

  return { accepted: false, position: null, mode: "none" };
}

/**
 * 日期字段的核对：先比月日，月日匹配就算通过；
 * 月日不同才退回普通字符串匹配。
 * 原因：原文“11月15日”，AI 返回“2026年11月15日”是正常情况，
 * 完整字符串在原文里找不到，但月日对得上，语义正确，不该误拦。
 */
export function findDateInSource(value, sourceText) {
  const v = String(value || "").trim();
  const src = String(sourceText || "");
  if (!v) return { accepted: false, position: null, mode: "none" };

  const mdValue = extractMonthDay(v);
  const mdSource = extractMonthDay(src);

  if (mdValue && mdSource && mdValue === mdSource) {
    return { accepted: true, position: null, mode: "monthday" };
  }

  return findValueInSource(v, src);
}

/**
 * 通用的字符串核对。找不到就返回 accepted: false。
 */
export function groundStringValue(value, sourceText) {
  const r = findValueInSource(value, sourceText);
  if (r.accepted) {
    return {
      accepted: true,
      value: String(value).trim(),
      position: r.position,
      mode: r.mode,
      reason: null,
    };
  }
  return {
    accepted: false,
    value: null,
    position: null,
    mode: "none",
    reason: "原文中找不到这个值",
  };
}

export function groundDateValue(value, sourceText) {
  const r = findDateInSource(value, sourceText);
  if (r.accepted) {
    return {
      accepted: true,
      value: String(value).trim(),
      position: r.position,
      mode: r.mode,
      reason: null,
    };
  }
  return {
    accepted: false,
    value: null,
    position: null,
    mode: "none",
    reason: "原文中找不到这个日期",
  };
}