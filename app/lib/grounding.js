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
 * - 日期：先比“月日”结构（如 11-15），月日相同就算通过。
 * - 时间：先做时间归一化（下午五点 / 17:00 / 17点 / 17点整 都是 17:00），
 *   归一化后相同就算通过。
 * - 都找不到：拦下，记录到 _groundingDropped。
 *
 * 【为什么需要宽松匹配】
 * 真实场景：原文“图书馆六楼”，模型返回“图书馆6楼”。
 * 语义完全相同，只做精确匹配会误拦。
 * 类似情况还有：空格差异、括号说明、日期分隔符、时间表示法。
 * 这些必须通过，否则拦错了比拦漏了更糟。
 */

const STRIP_PUNCT = "，。！？；：、,.;:!?\"'`《》<>()（）【】[]{}<>-=~/";

const CN_NUM_MAP = {
  零: "0", 〇: "0", 一: "1", 二: "2", 两: "2",
  三: "3", 四: "4", 五: "5", 六: "6", 七: "7", 八: "8", 九: "9",
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

/**
 * 中文数字转阿拉伯。支持：单个数字、十X、X十。
 * 例：五 → 5，十五 → 15，十 → 10，二十 → 20（"二十"作为小时不常见，但结构对）。
 */
function normalizeChineseDigits(s) {
  const str = String(s || "");
  let out = "";
  let i = 0;
  while (i < str.length) {
    const ch = str[i];
    const next = str[i + 1];

    // “十X” → 1X
    if (ch === "十" && next && next in CN_NUM_MAP) {
      out += "1" + CN_NUM_MAP[next];
      i += 2;
      continue;
    }
    // 单独“十” → 10
    if (ch === "十") {
      out += "10";
      i++;
      continue;
    }
    // “X十” → X0
    if (ch in CN_NUM_MAP && next === "十") {
      out += CN_NUM_MAP[ch] + "0";
      i += 2;
      // 若“X十Y”还有 Y，继续
      continue;
    }
    // 单个中文数字
    if (ch in CN_NUM_MAP) {
      out += CN_NUM_MAP[ch];
      i++;
      continue;
    }
    out += ch;
    i++;
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
 * 从字符串提取“月-日”结构。
 *
 * 支持的写法：
 *   2026-11-15 / 2026/11/15 / 2026.11.15 / 2026年11月15日（完整年月日）
 *   11月15日 / 11月15号 / 11-15 / 11/15 / 11.15（仅月日）
 *   十一月十五日（中文，先转阿拉伯再解析）
 *
 * 返回 "11-15" 或 null。
 *
 * 【为什么先匹配完整年月日】
 * 旧实现用 /([0-9]+)[-/]([0-9]+)/ 匹配“2026-11-15”时，
 * 会把 2026 当成月、11 当成日，返回 "2026-11"——完全错误。
 * 用户实测：原文“十一月十五日”，AI 返回“2026-11-15”，被误拦。
 * 修法：优先匹配四位数年份 + 月 + 日，找不到再退回到月日。
 */
export function extractMonthDay(s) {
  let t = toHalfWidth(String(s || ""));
  t = normalizeChineseDigits(t);

  // 完整年月日：2026-11-15 / 2026/11/15 / 2026.11.15 / 2026年11月15日
  const m0 = t.match(/([0-9]{4})[-/年.]([0-9]{1,2})[-/月.]([0-9]{1,2})/);
  if (m0) {
    return parseInt(m0[2], 10) + "-" + parseInt(m0[3], 10);
  }

  // 仅月日（“月”字）：11月15日 / 11月15号
  const m1 = t.match(/([0-9]{1,2})月([0-9]{1,2})[日号]?/);
  if (m1) {
    return parseInt(m1[1], 10) + "-" + parseInt(m1[2], 10);
  }

  // 仅月日（分隔符）：11-15 / 11/15 / 11.15
  const m2 = t.match(/([0-9]{1,2})[-/.]([0-9]{1,2})/);
  if (m2) {
    return parseInt(m2[1], 10) + "-" + parseInt(m2[2], 10);
  }

  return null;
}

/**
 * 时间归一化为 "HH:MM"。
 * 支持：下午五点 / 下午5点 / 17:00 / 17点 / 17点整 / 上午九点半 / 晚上八点
 * 归一化失败返回 null。
 *
 * 例：“下午五点” → “17:00”
 *     “17:00”  → “17:00”
 *     “17点”   → “17:00”
 *     “中午十二点” → “12:00”
 */
export function normalizeTimeValue(s) {
  let t = toHalfWidth(String(s || "").trim());
  t = normalizeChineseDigits(t);

  let half = false;
  if (t.includes("半")) {
    half = true;
    t = t.split("半").join("");
  }

  let hour = null;
  let minute = 0;

  const m1 = t.match(/([0-9]{1,2})[:：]([0-9]{1,2})/);
  if (m1) {
    hour = parseInt(m1[1], 10);
    minute = parseInt(m1[2], 10);
  } else {
    const m2 = t.match(/([0-9]{1,2})[点时]/);
    if (m2) {
      hour = parseInt(m2[1], 10);
      if (half) minute = 30;
    }
  }

  if (hour === null) return null;

  if ((t.includes("下午") || t.includes("晚上") || t.includes("傍晚")) && hour < 12) {
    hour += 12;
  }
  if (t.includes("中午") && hour < 12) hour += 12;
  if (t.includes("凌晨") && hour === 12) hour = 0;

  return String(hour).padStart(2, "0") + ":" + String(minute).padStart(2, "0");
}

/**
 * 去原文里找值。先精确后宽松。
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
 * 日期字段的核对：先比“月日”（11-15 这种结构），
 * 月日相同就算通过；月日不同才退回普通字符串匹配。
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
 * 时间字段的核对：先尝试精确/宽松匹配，都不行再做时间归一化比较。
 *
 * 例：原文“下午5点”，AI 返回“17:00” / “17点” / “17点整” 都视为同一时刻。
 * 从原文里把所有可能的时间片段（下午X点、X:XX、X点等）抠出来，
 * 逐一归一化，找到相同的就是通过。
 */
export function findTimeInSource(value, sourceText) {
  const v = String(value || "").trim();
  const src = String(sourceText || "");
  if (!v) return { accepted: false, position: null, mode: "none" };

  // 1. 先精确/宽松匹配
  const r = findValueInSource(v, src);
  if (r.accepted) return r;

  // 2. 时间归一化比较
  const vNorm = normalizeTimeValue(v);
  if (!vNorm) return { accepted: false, position: null, mode: "none" };

  const TIME_SPAN_RE = new RegExp(
    "(?:上午|下午|中午|晚上|凌晨|早上|傍晚)?[0-9一二三四五六七八九十]+[点时](?:[0-9一二三四五六七八九十]+分)?(?:半)?|[0-9]{1,2}[:：][0-9]{1,2}",
    "g"
  );

  let m;
  while ((m = TIME_SPAN_RE.exec(src)) !== null) {
    const srcNorm = normalizeTimeValue(m[0]);
    if (srcNorm && srcNorm === vNorm) {
      return {
        accepted: true,
        position: { start: m.index, end: m.index + m[0].length },
        mode: "normalized",
      };
    }
  }

  return { accepted: false, position: null, mode: "none" };
}

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

export function groundTimeValue(value, sourceText) {
  const r = findTimeInSource(value, sourceText);
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
    reason: "原文中找不到这个时间",
  };
}