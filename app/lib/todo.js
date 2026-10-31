/**
 * 待办筛选与剩余时间格式化。纯函数。
 */

export function getCalendarDayDiff(deadlineTs, nowTs) {
  const d = new Date(deadlineTs);
  const n = new Date(nowTs);
  const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const b = Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
  return Math.round((a - b) / 86400000);
}

/**
 * 返回 { text, level }
 * level: "expired" | "red" | "amber" | "blue"
 *
 * 规则：
 *   已过期            → "已过期"
 *   0 < 剩余 < 1 小时 → "不到 1 小时"（red）
 *   1–24 小时         → "剩 N 小时"（red，向下取整，最多 23）
 *   ≥ 24 小时         → "剩 N 天"（按自然日）
 *      N ≤ 3 → red，N ≤ 7 → amber，其余 → blue
 */
export function formatRemaining(deadlineTs, nowTs) {
  const diff = deadlineTs - nowTs;
  if (diff < 0) return { text: "已过期", level: "expired" };
  if (diff < 3600000) return { text: "不到 1 小时", level: "red" };
  if (diff < 86400000) {
    // 向下取整：23 小时 50 分显示“剩 23 小时”，不会向上凑成 24
    const hours = Math.floor(diff / 3600000);
    return { text: "剩 " + hours + " 小时", level: "red" };
  }
  const days = getCalendarDayDiff(deadlineTs, nowTs);
  if (days <= 3) return { text: "剩 " + days + " 天", level: "red" };
  if (days <= 7) return { text: "剩 " + days + " 天", level: "amber" };
  return { text: "剩 " + days + " 天", level: "blue" };
}

/**
 * 筛选待办：未过期且剩余自然日 ≤ 3，按截止时间升序。
 */
export function getTodoItems(notices, nowTs) {
  return notices
    .filter((n) => {
      if (!n.deadlineDate) return false;
      if (n.deadlineDate <= nowTs) return false;
      const days = getCalendarDayDiff(n.deadlineDate, nowTs);
      return days >= 0 && days <= 3;
    })
    .sort((a, b) => a.deadlineDate - b.deadlineDate);
}

export function formatDateCN(ts) {
  const d = new Date(ts);
  return d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日";
}

export function formatTimeHM(ts) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return hh + ":" + mm;
}