/**
 * 重复导入判定。
 *
 * 【三种结果要说清楚】
 *   exact       正文完全一样，已经导入过，正常做法是跳过
 *   title_same  标题一样但正文不一样，这是改过的通知或者同系列通知，
 *               既不能当成重复直接丢，也不能闷声覆盖旧的那条
 *   none        没见过
 */

// 空白用字符码拼，不写反斜杠转义。项目里踩过反斜杠加数字的坑。
const SPACE_CHARS = [9, 10, 13, 32, 12288]
  .map((c) => String.fromCharCode(c))
  .join("");

const STRIP = new RegExp(
  "[" +
    SPACE_CHARS +
    "，。；：、！？,.;:!?\"'“”‘’" +
    String.fromCharCode(65288) +
    String.fromCharCode(65289) +
    "()【】《》〈〉「」]"
);

export function normalizeForCompare(text) {
  return String(text || "").split(STRIP).join("");
}

export function noticeTitle(text) {
  const lines = String(text || "").split(String.fromCharCode(10));
  for (const line of lines) {
    const t = line.split(String.fromCharCode(13)).join("").trim();
    if (t) return t;
  }
  return "";
}

export function checkDuplicate(text, notices) {
  const target = normalizeForCompare(text);
  if (!target) return { type: "none", notice: null };

  for (const n of notices || []) {
    if (normalizeForCompare(n.text) === target) {
      return { type: "exact", notice: n };
    }
  }

  const title = normalizeForCompare(noticeTitle(text));
  if (title) {
    for (const n of notices || []) {
      if (normalizeForCompare(noticeTitle(n.text)) === title) {
        return { type: "title_same", notice: n };
      }
    }
  }

  return { type: "none", notice: null };
}

// 同一事项在日历里只出现一次。键用事项名加日期时间，不考虑它是哪条通知带来的。
export function itemCalendarKey(item) {
  return [item.name, item.date, item.time || ""].join("|");
}

// 一轮导入里去掉重复事项，保留先出现的那条。
export function dedupeItems(items) {
  const seen = new Set();
  const out = [];
  for (const it of items || []) {
    const k = itemCalendarKey(it);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}
