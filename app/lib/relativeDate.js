/**
 * 相对日期的本地确定性换算。纯函数，不依赖网络、不依赖 AI、不依赖密钥。
 *
 * 一周从星期一开始，周日是最后一天。
 *
 * 支持的说法：
 *   - 今天 / 明天 / 后天 / 大后天
 *   - 下周一 ~ 下周日（含“下周天”）
 *   - 本周X / 这周X / 本星期X / 这星期X（已过则顺延到下周）
 *   - 本月底 / 本月末 / 本月初 / 下月底 / 下月末 / 下月初
 *   - 本月X日 / 下月X日 / 本月X号 / 下月X号
 *
 * 算不出来的返回 null，绝不猜测。
 */

const DAY_MAP = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };

function addDays(base, n) {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + n);
}

function formatCN(date) {
  return (
    date.getFullYear() +
    "年" +
    (date.getMonth() + 1) +
    "月" +
    date.getDate() +
    "日"
  );
}

/**
 * @param {string} text 相对日期文本，如“明天”“下周三”“本月底”
 * @param {Date} now 基准时间
 * @returns {{ date: Date, normalized: string } | null}
 */
export function resolveRelativeDate(text, now = new Date()) {
  const s = String(text || "").trim();
  if (!s) return null;

  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // 今天 / 明天 / 后天 / 大后天
  const relDays = { 今天: 0, 明天: 1, 后天: 2, 大后天: 3 };
  if (s in relDays) {
    const d = addDays(base, relDays[s]);
    return { date: d, normalized: formatCN(d) };
  }

  // 下周X / 本周X / 这周X
  const m1 = s.match(/^(下|本|这)?(?:周|星期)([一二三四五六日天])$/);
  if (m1) {
    const prefix = m1[1] || "本";
    const target = DAY_MAP[m1[2]];
    const mondayBased = (base.getDay() + 6) % 7; // 0=周一 ... 6=周日
    const targetMondayBased = (target + 6) % 7;

    let offset;
    if (prefix === "下") {
      // 下一周：从下周一算起
      offset = 7 - mondayBased + targetMondayBased;
    } else {
      // 本周：本周内的对应星期几；已过则顺延到下周
      offset = -mondayBased + targetMondayBased;
      if (offset < 0) offset += 7;
    }

    const d = addDays(base, offset);
    return { date: d, normalized: formatCN(d) };
  }

  // 本月底 / 本月末
  if (s === "本月底" || s === "本月末") {
    const d = new Date(base.getFullYear(), base.getMonth() + 1, 0);
    return { date: d, normalized: formatCN(d) };
  }

  // 本月初
  if (s === "本月初") {
    const d = new Date(base.getFullYear(), base.getMonth(), 1);
    return { date: d, normalized: formatCN(d) };
  }

  // 下月底 / 下月末
  if (s === "下月底" || s === "下月末") {
    const d = new Date(base.getFullYear(), base.getMonth() + 2, 0);
    return { date: d, normalized: formatCN(d) };
  }

  // 下月初
  if (s === "下月初") {
    const d = new Date(base.getFullYear(), base.getMonth() + 1, 1);
    return { date: d, normalized: formatCN(d) };
  }

  // 本月X日 / 下月X日
  const m2 = s.match(/^(本月|下月)([0-9]{1,2})[日号]?$/);
  if (m2) {
    const monthOffset = m2[1] === "本月" ? 0 : 1;
    const day = parseInt(m2[2], 10);
    const rawMonth = base.getMonth() + monthOffset;
    const year = base.getFullYear() + Math.floor(rawMonth / 12);
    const month = ((rawMonth % 12) + 12) % 12;

    // 检查日期合法（2月30日会溢出到3月，必须拒绝）
    const d = new Date(year, month, day);
    if (d.getFullYear() !== year || d.getMonth() !== month || d.getDate() !== day) {
      return null;
    }

    // 本月的日期如果已过，返回 null（不猜是否顺延）
    if (monthOffset === 0) {
      const todayMidnight = new Date(
        base.getFullYear(),
        base.getMonth(),
        base.getDate()
      );
      if (d < todayMidnight) return null;
    }

    return { date: d, normalized: formatCN(d) };
  }

  return null;
}

/**
 * 判断一个相对日期文本能否被本地换算。
 */
export function isResolvableRelativeDate(text) {
  return resolveRelativeDate(text, new Date()) !== null;
}