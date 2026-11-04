// 纯逻辑：在原文里定位某个解析字段值的位置。
// 找不到必须返回 null——这是"防编造"的最后一环，绝不能随便指一处。

// 在 text 中找一个 token 的位置。先精确找；找不到时允许 1 个字符不同。
export function locateTokenInText(text, token) {
  if (!text || !token) return null;

  const exact = text.indexOf(token);
  if (exact !== -1) return { start: exact, end: exact + token.length };

  if (token.length < 2) return null;

  for (let i = 0; i + token.length <= text.length; i++) {
    let diffs = 0;
    for (let j = 0; j < token.length; j++) {
      if (text.charAt(i + j) !== token.charAt(j)) {
        diffs++;
        if (diffs > 1) break;
      }
    }
    if (diffs <= 1) return { start: i, end: i + token.length };
  }
  return null;
}

// 在原文里定位界面显示的标题文字，返回 { start, end } 或 null。
// 标题不是抽取字段，显示文字来自 getNoticeTitle，可能被截成前四十字加省略号。
// 定位时先去掉末尾省略号，再按前缀在原文里找，找不到返回 null。
export function findTitleSpan(text, displayText) {
  if (!text || !displayText) return null;

  const suffix = "…";
  const prefix = displayText.endsWith(suffix)
    ? displayText.slice(0, displayText.length - suffix.length)
    : displayText;
  if (!prefix) return null;

  const at = text.indexOf(prefix);
  if (at === -1) return null;
  return { start: at, end: at + prefix.length };
}

// 在原文里定位字段值，返回 { start, end } 或 null。
// - 程序换算出来的日期（_inferredDeadline）视为原文没有，返回 null
// - 空字段返回 null
// - 数组字段要求每个值都能找到
export function findSpan(text, field, analysis) {
  if (!text || !field || !analysis) return null;

  if (field.key === "deadline" && analysis._inferredDeadline) return null;

  const raw = analysis[field.key];
  if (Array.isArray(raw)) {
    if (raw.length === 0) return null;
  } else if (!raw) {
    return null;
  }

  const tokens = Array.isArray(raw) ? raw : [String(raw)];
  let spanStart = -1;
  let spanEnd = -1;

  for (const tokenStr of tokens) {
    const token = String(tokenStr).trim();
    if (!token) return null;
    const hit = locateTokenInText(text, token);
    if (!hit) return null;
    if (spanStart === -1 || hit.start < spanStart) spanStart = hit.start;
    if (hit.end > spanEnd) spanEnd = hit.end;
  }

  return spanStart === -1 ? null : { start: spanStart, end: spanEnd };
}
