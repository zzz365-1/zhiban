/**
 * 月历网格计算。纯函数，不依赖浏览器 API。
 * month 从 0 开始（0 = 1月，11 = 12月），与 Date 一致。
 */

export function getDaysInMonth(year, month) {
  // new Date(year, month + 1, 0) 是“下个月的第 0 天”，即本月最后一天
  return new Date(year, month + 1, 0).getDate();
}

export function getFirstWeekday(year, month) {
  // 0 = 周日，1 = 周一，... 6 = 周六
  return new Date(year, month, 1).getDay();
}

/**
 * 返回一个完整的月历网格，按周排列，周日开头。
 * 长度总是 7 的倍数（28/35/42）。
 * 每格：{ date: Date, inMonth: boolean }
 * 不在本月的格子（上个月尾巴、下个月开头）inMonth = false。
 */
export function buildMonthGrid(year, month) {
  const firstDay = getFirstWeekday(year, month);
  const daysInMonth = getDaysInMonth(year, month);
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;

  const startDate = new Date(year, month, 1 - firstDay);
  const grid = [];
  for (let i = 0; i < totalCells; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    grid.push({
      date: d,
      inMonth: d.getMonth() === month,
    });
  }
  return grid;
}

export function formatDateKey(date) {
  return (
    date.getFullYear() +
    "-" +
    (date.getMonth() + 1) +
    "-" +
    date.getDate()
  );
}