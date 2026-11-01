/**
 * 把一大段文字分割成多条通知，并提供去重工具。
 * 纯函数，页面和自检脚本共用。
 *
 * 分割策略（保守，宁可少分也不错分）：
 *   1. 按空行（连续两个及以上换行）分割
 *   2. 若只分出一块，但内部有 ≥2 行以“关于……的通知”开头，按标题行分割
 *   3. 都不行时：
 *      a. 若检测到 ≥2 个行首编号（一、/1./（1）等），视为单条通知的结构化条目，
 *         原样返回 1 条
 *      b. 否则若内容像单条，原样返回 1 条
 *      c. 否则若内容明显有多条迹象，报错，不硬拆
 */

const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);
const CRLF = CR + LF;

const WS_CHARS =
  String.fromCharCode(9) +
  String.fromCharCode(10) +
  String.fromCharCode(11) +
  String.fromCharCode(12) +
  String.fromCharCode(13) +
  " ";
const WS_RE = new RegExp("[" + WS_CHARS + "]+", "g");

const HEADER_RE = new RegExp("^关于.+?的通知[：:]?$");

const NUMBERED_PATTERNS = [
  new RegExp("^[一二三四五六七八九十]+[、.．]"),
  new RegExp("^[（(][一二三四五六七八九十0-9]+[）)]"),
  new RegExp("^[0-9]+[、.．)）]"),
];

function normalizeLineEndings(text) {
  return String(text || "").split(CRLF).join(LF).split(CR).join(LF);
}

function splitByBlankLines(text) {
  const lines = text.split(LF);
  const blocks = [];
  let cur = [];
  for (const line of lines) {
    if (line.trim() === "") {
      if (cur.length > 0) {
        const b = cur.join(LF).trim();
        if (b) blocks.push(b);
        cur = [];
      }
    } else {
      cur.push(line);
    }
  }
  if (cur.length > 0) {
    const b = cur.join(LF).trim();
    if (b) blocks.push(b);
  }
  return blocks;
}

function findHeaderIndices(lines) {
  const result = [];
  for (let i = 0; i < lines.length; i++) {
    if (HEADER_RE.test(lines[i].trim())) result.push(i);
  }
  return result;
}

function countSubstring(text, sub) {
  if (!sub) return 0;
  let count = 0;
  let idx = text.indexOf(sub);
  while (idx !== -1) {
    count++;
    idx = text.indexOf(sub, idx + sub.length);
  }
  return count;
}

function countNumberedItems(lines) {
  let count = 0;
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    for (const p of NUMBERED_PATTERNS) {
      if (p.test(t)) {
        count++;
        break;
      }
    }
  }
  return count;
}

function looksLikeMultipleNotices(text, lines) {
  const numbered = countNumberedItems(lines);
  if (numbered >= 2) return false;

  const qingyu = countSubstring(text, "请于");
  const deadlineWords =
    countSubstring(text, "截止") +
    countSubstring(text, "报送") +
    countSubstring(text, "提交") +
    countSubstring(text, "报名");

  if (qingyu >= 4 && text.length > 100) return true;
  if (text.length > 400 && qingyu >= 2) return true;
  if (text.length > 400 && deadlineWords >= 3) return true;
  if (text.length > 1000) return true;

  return false;
}

export function splitNotices(raw) {
  const text = normalizeLineEndings(raw).trim();
  if (!text) return { ok: false, reason: "没有可解析的内容" };

  const lines = text.split(LF);
  const headerIndices = findHeaderIndices(lines);
  const blocks = splitByBlankLines(text);

  if (blocks.length >= 2) {
    return { ok: true, items: blocks, method: "blank-line" };
  }

  if (headerIndices.length >= 2) {
    const items = [];
    for (let i = 0; i < headerIndices.length; i++) {
      const start = headerIndices[i];
      const end =
        i + 1 < headerIndices.length ? headerIndices[i + 1] : lines.length;
      const block = lines.slice(start, end).join(LF).trim();
      if (!block) {
        return {
          ok: false,
          reason: "按标题切分后出现空段，无法可靠分割",
        };
      }
      items.push(block);
    }
    if (items.length < 2) {
      return { ok: false, reason: "检测到多个标题但只切出一条" };
    }
    return { ok: true, items, method: "header" };
  }

  if (blocks.length === 1) {
    if (looksLikeMultipleNotices(text, lines)) {
      return {
        ok: false,
        reason:
          "这段文字可能包含多条通知，但找不到明确的分隔边界。请在通知之间留空行，或让每条通知以“关于……的通知”开头。",
      };
    }
    return { ok: true, items: blocks, method: "single" };
  }

  return { ok: false, reason: "无法识别通知边界" };
}

export function normalizeForDedup(text) {
  return String(text || "").replace(WS_RE, " ").trim();
}

export function isDuplicate(text, notices) {
  const target = normalizeForDedup(text);
  if (!target) return false;
  for (const n of notices || []) {
    if (normalizeForDedup(n.text) === target) return true;
  }
  return false;
}

/**
 * 快速判断一段文本大概有几条通知。
 * 返回 { count: number|null, confident: boolean }
 *   - confident = false：拿不准（内容像多条但分不开，或空文本）
 *   - count = 1 且 confident = true：确定是单条
 *   - count >= 2 且 confident = true：确定是多条
 * 不调用模型，纯本地判断，毫秒级返回。
 */
export function detectNoticeCount(raw) {
  const result = splitNotices(raw);
  if (!result.ok) {
    return { count: null, confident: false };
  }
  if (result.items.length >= 2) {
    return { count: result.items.length, confident: true };
  }
  return { count: 1, confident: true };
}