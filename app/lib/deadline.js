const RE_YMD = new RegExp("^([0-9]{4})[ ]*[-/年.][ ]*([0-9]{1,2})[ ]*[-/月.][ ]*([0-9]{1,2})");
const RE_MD = new RegExp("^([0-9]{1,2})[ ]*(?:月|[/-])[ ]*([0-9]{1,2})");
const RE_HM = new RegExp("^([0-9]{1,2}):([0-9]{2})$");

// 判断原始时间字符串是否是「合法时分写法」。
// 只看原始输入，不从算出来的 Date 倒推——时间戳分不出原文有没有写时刻。
// 空串、null、别的乱写一律算没有明确时刻。
export function hasExplicitTime(time) {
  const s = String(time == null ? "" : time).trim();
  if (!s) return false;
  const m = s.match(RE_HM);
  if (!m) return false;
  const h = parseInt(m[1], 10);
  const mi = parseInt(m[2], 10);
  return h >= 0 && h <= 23 && mi >= 0 && mi <= 59;
}

// 无明确时刻的统一说明文字，页面各处以同一句为准。
export const NO_TIME_NOTE = "具体时刻未说明";

// 用户手输日期的严格解析：整串必须完全匹配，不允许尾巴带别的字
const RE_INPUT_YMD = new RegExp(
  "^([0-9]{4})[ ]*[-/年.][ ]*([0-9]{1,2})[ ]*[-/月.][ ]*([0-9]{1,2})[ ]*[日号]?$"
);
const RE_INPUT_MD = new RegExp(
  "^([0-9]{1,2})[ ]*(?:月|[/-])[ ]*([0-9]{1,2})[ ]*[日号]?$"
);

/**
 * 严格解析用户手输的日期。
 * 支持：11月6日 / 11月6 / 2026-11-06 / 2026/11/6 / 2026年11月6日 / 11/6 / 11-6
 * 返回 { date: Date, normalized: "YYYY年M月D日" }，认不出来返回 null。
 * 不猜测：13月45日、2026-13-45、abc 都返回 null。
 */
export function parseUserDateInput(input, baseDate = new Date()) {
  const s = String(input || "").trim();
  if (!s) return null;

  let m = s.match(RE_INPUT_YMD);
  if (m) {
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10) - 1;
    const d = parseInt(m[3], 10);
    const dt = new Date(y, mo, d);
    if (
      dt.getFullYear() !== y ||
      dt.getMonth() !== mo ||
      dt.getDate() !== d
    ) {
      return null;
    }
    return { date: dt, normalized: y + "年" + (mo + 1) + "月" + d + "日" };
  }

  m = s.match(RE_INPUT_MD);
  if (m) {
    const mo = parseInt(m[1], 10) - 1;
    const d = parseInt(m[2], 10);
    let y = baseDate.getFullYear();
    if (
      mo < baseDate.getMonth() ||
      (mo === baseDate.getMonth() && d < baseDate.getDate())
    ) {
      y += 1;
    }
    const dt = new Date(y, mo, d);
    if (
      dt.getFullYear() !== y ||
      dt.getMonth() !== mo ||
      dt.getDate() !== d
    ) {
      return null;
    }
    return { date: dt, normalized: y + "年" + (mo + 1) + "月" + d + "日" };
  }

  return null;
}

/**
 * 从解析结果生成 Date（容错，用于机器提取的文本）。
 * 手动修改请用 parseUserDateInput 先严格校验。
 */
export function buildDeadlineDate(deadline, time) {
  if (!deadline) return null;

  let year, month, day;

  let m = deadline.match(RE_YMD);
  if (m) {
    year = parseInt(m[1], 10);
    month = parseInt(m[2], 10) - 1;
    day = parseInt(m[3], 10);
  } else {
    m = deadline.match(RE_MD);
    if (!m) return null;
    month = parseInt(m[1], 10) - 1;
    day = parseInt(m[2], 10);
    year = new Date().getFullYear();
    const now = new Date();
    if (month < now.getMonth() || (month === now.getMonth() && day < now.getDate())) {
      year += 1;
    }
  }

  // 没有明确时刻时，排序基准就落在当天零点，绝不跨天。
  // 这只是一个排序用的基准点，不代表通知要求的时刻。
  let hours = 0;
  let minutes = 0;
  if (hasExplicitTime(time)) {
    const tm = time.match(RE_HM);
    hours = parseInt(tm[1], 10);
    minutes = parseInt(tm[2], 10);
  }

  return new Date(year, month, day, hours, minutes, 0, 0);
}

/**
 * 距离截止日期还有多少自然日。今天到期返回 0，已过期返回负数。
 * nowDate 可选，测试时注入固定时间用；页面不传则用当前时间。
 */
export function getRemainingDays(deadlineDate, nowDate = new Date()) {
  if (deadlineDate === null || deadlineDate === undefined) return null;
  const d = deadlineDate instanceof Date ? deadlineDate : new Date(deadlineDate);
  if (isNaN(d.getTime())) return null;
  const now = nowDate instanceof Date ? nowDate : new Date(nowDate);
  const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a - b) / 86400000);
}