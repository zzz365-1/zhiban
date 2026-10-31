/**
 * 把一大段文字分割成多条通知，并提供去重工具。
 * 纯函数，页面和自检脚本共用。
 *
 * 分割策略（保守，宁可少分也不错分）：
 *   1. 按空行（连续两个及以上换行）分割
 *   2. 若只分出一块，但内部有 ≥2 行以“关于……的通知”开头，按标题行分割
 *   3. 都不行时：若内容像单条，原样返回 1 条
 *   4. 若内容明显有多条迹象却找不到边界，报错，不硬拆
 *
 * “多条迹象”判定（任一命中即拒绝）：
 *   - “请于”≥4 次且长度 > 100
 *   - 长度 > 400 且“请于”≥2 次
 *   - 长度 > 400 且截止类动作词（截止/报送/提交/报名）≥3 次
 *   - 长度 > 1000（无论内容）
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

/**
 * 判断“一段没有被明确边界切开的文本”是否看起来像多条通知堆在一起。
 * 命中即视为“分不开”，让用户去加空行或加标题，而不是硬拆。
 */
function looksLikeMultipleNotices(text) {
  const qingyu = countSubstring(text, "请于");
  const deadlineWords =
    countSubstring(text, "截止") +
    countSubstring(text, "报送") +
    countSubstring(text, "提交") +
    countSubstring(text, "报名");

  // 极强信号：短文本里出现 ≥4 个“请于”
  if (qingyu >= 4 && text.length > 100) return true;

  // 中长文本 + 多个截止动作
  if (text.length > 400 && qingyu >= 2) return true;
  if (text.length > 400 && deadlineWords >= 3) return true;

  // 无论内容，超长一律拒绝
  if (text.length > 1000) return true;

  return false;
}

/**
 * @param {string} raw
 * @returns {{ ok: true, items: string[], method: string }
 *         | { ok: false, reason: string }}
 */
export function splitNotices(raw) {
  const text = normalizeLineEndings(raw).trim();
  if (!text) return { ok: false, reason: "没有可解析的内容" };

  const lines = text.split(LF);
  const headerIndices = findHeaderIndices(lines);
  const blocks = splitByBlankLines(text);

  // 策略1：空行分出 ≥2 条
  if (blocks.length >= 2) {
    return { ok: true, items: blocks, method: "blank-line" };
  }

  // 策略2：≥2 个“关于……的通知”标题，按标题行切
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

  // 策略3：看起来像单条，原样返回；看起来像多条但切不开，报错
  if (blocks.length === 1) {
    if (looksLikeMultipleNotices(text)) {
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

/**
 * 去重用的规范化：折叠所有空白为单空格、去掉首尾空白。
 */
export function normalizeForDedup(text) {
  return String(text || "").replace(WS_RE, " ").trim();
}

/**
 * 判断 text 是否与列表中任一通知重复。
 */
export function isDuplicate(text, notices) {
  const target = normalizeForDedup(text);
  if (!target) return false;
  for (const n of notices || []) {
    if (normalizeForDedup(n.text) === target) return true;
  }
  return false;
}