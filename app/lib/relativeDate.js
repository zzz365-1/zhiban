/**
 * 相对日期的本地确定性换算。纯函数，不依赖网络、不依赖 AI、不依赖密钥。
 *
 * 【为什么不用 AI 算日期】
 * 模型的本质是概率预测，对“一周从哪天开始”“本月有没有 31 日”这类
 * 确定性的日历规则没有稳定认知。同一个输入可能今天对、明天错，
 * 而界面上完全看不出来。用户按错误的日期去办事，后果由用户承担。
 * 所以所有能确定换算的说法都在本地用纯函数做，AI 只负责“从原文里选
 * 哪个日期是用户要赶的”，不负责换算。
 *
 * 一周从星期一开始，周日是最后一天。
 *
 * 支持的说法：
 *   - 今天 / 明天 / 后天 / 大后天
 *   - 下周一 ~ 下周日（含“下周天”）
 *   - 本周X / 这周X / 本星期X / 这星期X（已过则顺延到下周）
 *   - 本月底 / 本月末 / 本月初 / 下月底 / 下月末 / 下月初
 *   - 本月X日 / 下月X日 / 本月X号 / 下月X号
 *   - X天内 / X天后 / X日内 / X日后 / 过X天
 *   - X周内 / X周后 / X个星期内 / X个星期后
 *   - X个月内 / X个月后 / X个年内 / X年后
 *
 * 算不出来的返回 null，绝不猜测。
 * “一周后”按 7 个自然日计算，不是 5 个工作日。
 * “一个月后”按自然月计算（1月31日 + 1月 = 2月28/29日），不是 30 天。
 */

const DAY_MAP = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };

const CN_DIGITS = {
  一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5,
  六: 6, 七: 7, 八: 8, 九: 9,
};

/**
 * 解析中文数字（一到九十九）或纯阿拉伯数字。无法解析返回 null。
 */
function parseChineseNumber(s) {
  if (!s) return null;
  const str = String(s).trim();

  if (new RegExp("^[0-9]+$").test(str)) {
    return parseInt(str, 10);
  }

  if (str === "十") return 10;

  const m1 = str.match(new RegExp("^十([一二三四五六七八九])$"));
  if (m1) return 10 + CN_DIGITS[m1[1]];

  const m2 = str.match(new RegExp("^([一二三四五六七八九])十$"));
  if (m2) return CN_DIGITS[m2[1]] * 10;

  const m3 = str.match(
    new RegExp("^([一二三四五六七八九])十([一二三四五六七八九])$")
  );
  if (m3) return CN_DIGITS[m3[1]] * 10 + CN_DIGITS[m3[2]];

  if (str.length === 1 && str in CN_DIGITS) return CN_DIGITS[str];

  return null;
}

function addDays(base, n) {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + n);
}

/**
 * 加 n 个自然月。目标月没有对应日时退到该月最后一天。
 * 例：2026-01-31 + 1 个月 = 2026-02-28（平年）
 *     2024-01-31 + 1 个月 = 2024-02-29（闰年）
 *     2026-03-31 + 1 个月 = 2026-04-30
 */
function addMonths(base, n) {
  const y = base.getFullYear();
  const m = base.getMonth();
  const d = base.getDate();

  const totalMonths = y * 12 + m + n;
  const targetY = Math.floor(totalMonths / 12);
  const targetM = ((totalMonths % 12) + 12) % 12;

  const lastDay = new Date(targetY, targetM + 1, 0).getDate();
  const targetD = Math.min(d, lastDay);

  return new Date(targetY, targetM, targetD);
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
 * @param {string} text 相对日期文本
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
  const m1 = s.match(new RegExp("^(下|本|这)?(?:周|星期)([一二三四五六日天])$"));
  if (m1) {
    const prefix = m1[1] || "本";
    const target = DAY_MAP[m1[2]];
    const mondayBased = (base.getDay() + 6) % 7;
    const targetMondayBased = (target + 6) % 7;

    let offset;
    if (prefix === "下") {
      offset = 7 - mondayBased + targetMondayBased;
    } else {
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
  const m2 = s.match(new RegExp("^(本月|下月)([0-9]{1,2})[日号]?$"));
  if (m2) {
    const monthOffset = m2[1] === "本月" ? 0 : 1;
    const day = parseInt(m2[2], 10);
    const rawMonth = base.getMonth() + monthOffset;
    const year = base.getFullYear() + Math.floor(rawMonth / 12);
    const month = ((rawMonth % 12) + 12) % 12;

    const d = new Date(year, month, day);
    if (
      d.getFullYear() !== year ||
      d.getMonth() !== month ||
      d.getDate() !== day
    ) {
      return null;
    }

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

  // 过X天 / 过X日（无后缀）
  const mOver = s.match(
    new RegExp("^过([0-9一二三四五六七八九十两]+)(?:天|日)$")
  );
  if (mOver) {
    const n = parseChineseNumber(mOver[1]);
    if (n !== null && n > 0 && n <= 365) {
      const d = addDays(base, n);
      return { date: d, normalized: formatCN(d) };
    }
    return null;
  }

  // X天内 / X天后 / X日内 / X日后（必须有后缀）
  const m3 = s.match(
    new RegExp(
      "^([0-9一二三四五六七八九十两]+)(?:天|日)(?:之内|以内|内|之后|以后|后)$"
    )
  );
  if (m3) {
    const n = parseChineseNumber(m3[1]);
    if (n !== null && n > 0 && n <= 365) {
      const d = addDays(base, n);
      return { date: d, normalized: formatCN(d) };
    }
    return null;
  }

  // X周内 / X周后 / X个星期内 / X个星期后
  const m4 = s.match(
    new RegExp(
      "^([0-9一二三四五六七八九十两]+)(?:周|个?星期)(?:之内|以内|内|之后|以后|后)$"
    )
  );
  if (m4) {
    const n = parseChineseNumber(m4[1]);
    if (n !== null && n > 0 && n <= 52) {
      const d = addDays(base, n * 7);
      return { date: d, normalized: formatCN(d) };
    }
    return null;
  }

  // X个月内 / X个月后（自然月，不是 30 天）
  const mMonth = s.match(
    new RegExp(
      "^([0-9一二三四五六七八九十两]+)(?:个)?月(?:之内|以内|内|之后|以后|后)$"
    )
  );
  if (mMonth) {
    const n = parseChineseNumber(mMonth[1]);
    if (n !== null && n > 0 && n <= 24) {
      const d = addMonths(base, n);
      return { date: d, normalized: formatCN(d) };
    }
    return null;
  }

  // X年内 / X年后（12 个月）
  const mYear = s.match(
    new RegExp(
      "^([0-9一二三四五六七八九十两]+)(?:个)?年(?:之内|以内|内|之后|以后|后)$"
    )
  );
  if (mYear) {
    const n = parseChineseNumber(mYear[1]);
    if (n !== null && n > 0 && n <= 10) {
      const d = addMonths(base, n * 12);
      return { date: d, normalized: formatCN(d) };
    }
    return null;
  }

  return null;
}

/**
 * 判断一个相对日期文本能否被本地换算（用当前时间）。
 */
export function isResolvableRelativeDate(text) {
  return resolveRelativeDate(text, new Date()) !== null;
}