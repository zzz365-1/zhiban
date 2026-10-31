const RE_YMD = new RegExp("^([0-9]{4})[ ]*[-/年.][ ]*([0-9]{1,2})[ ]*[-/月.][ ]*([0-9]{1,2})");
const RE_MD = new RegExp("^([0-9]{1,2})[ ]*(?:月|[/-])[ ]*([0-9]{1,2})");
const RE_HM = new RegExp("^([0-9]{1,2}):([0-9]{2})$");

/**
 * 把提取出的 deadline / time 转成 Date。
 * 模糊写法（本月底、下周三）返回 null，不猜测。
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

  let hours = 0;
  let minutes = 0;
  if (time) {
    const tm = time.match(RE_HM);
    if (tm) {
      hours = parseInt(tm[1], 10);
      minutes = parseInt(tm[2], 10);
    }
  }

  return new Date(year, month, day, hours, minutes, 0, 0);
}

/**
 * 返回距离截止日期还有多少天（按自然日计算）。
 * 今天到期返回 0，已过期返回负数，无法确定返回 null。
 */
export function getRemainingDays(deadlineDate) {
  if (deadlineDate === null || deadlineDate === undefined) return null;
  const d = deadlineDate instanceof Date ? deadlineDate : new Date(deadlineDate);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a - b) / 86400000);
}