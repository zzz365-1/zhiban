/**
 * 相对日期的本地确定性换算。纯函数，不依赖网络、不依赖 AI、不依赖密钥。
 *
 * 【为什么不用 AI 算日期】
 * 模型的本质是概率预测，对“一周从哪天开始”“本月有没有 31 日”这类
 * 确定性的日历规则没有稳定认知。同一个输入可能今天对、明天错，
 * 而界面上完全看不出来。所以所有能确定换算的说法都在本地用纯函数做，
 * AI 只负责“从原文里选哪个日期是用户要赶的”。
 *
 * 一周从星期一开始，周日是最后一天。
 *
 * 【为什么“X月”必须带“个”】
 * “一月”“二月”“三月”……“十二月”本身也是月份名。“三月之后”可以理解为
 * “三月份过完之后”，也可以理解为“三个月之后”，语义含糊。
 * 所以只有带“个”的“X个月”才按时间长度处理；不带“个”的“X月后/内”
 * 一律返回 null，交给 AI 兜底。宁可空着，也不要猜错。
 *
 * 支持的说法：
 *   - 今天 / 明天 / 后天 / 大后天 / 次日 / 隔天 / 即日
 *   - 周几（含省略前缀、本周、下周、下下周）：
 *     · 周三 / 星期三            → 本周；已过则顺延
 *     · 本周三 / 这周三 / 本星期三 / 这星期三
 *     · 这个周三 / 这个星期三 / 这一个周三 / 这一个星期三
 *     · 下周三 / 下周X / 下个周三 / 下个星期三
 *     · 下一个周三 / 下一个星期三 / 下一周周三
 *     · 下下周三 / 下下周X / 下下个周三 / 下下个星期三
 *   - 本月底 / 本月末 / 本月初 / 下月底 / 下月末 / 下月初
 *   - 本月X日 / 下月X日 / 本月X号 / 下月X号
 *   - X天内 / X天后 / X日内 / X日后 / 过X天
 *   - X周内 / X周后 / X个星期内 / X个星期后 / 过X周 / 过X个星期
 *   - X个月内 / X个月后 / 过X个月
 *   - X年内 / X年后 / 过X年
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
 * 周几前缀正则。长前缀放前面，避免“下”抢在“下下”“下个”之前匹配。
 * 前缀分类（用于决定加几周）：
 *   - 以“下下”开头 → +2 周
 *   - 以“下”开头（下/下个/下一个/下一周/下个星期） → +1 周
 *   - 本/这/这个/这一个/本周/本星期/这个星期/这一个星期/省略 → 本周（已过则顺延）
 */
const WEEK_PREFIX_RE =
  "(?:下下个星期|下下个|下下|下一个|下个星期|这个星期|这一个星期|下一个|本星期|下一周|下个|这个|这一个|本周|下|本|这)?";

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

  // 今天 / 明天 / 后天 / 大后天 / 次日 / 隔天 / 即日
  const relDays = {
    今天: 0, 即日: 0,
    明天: 1, 次日: 1, 隔天: 1,
    后天: 2,
    大后天: 3,
  };
  if (s in relDays) {
    const d = addDays(base, relDays[s]);
    return { date: d, normalized: formatCN(d) };
  }

  // 周几：支持省略前缀、本周/这个/这、下周/下个/下一个/下一周、下下周
  const m1 = s.match(
    new RegExp("^(" + WEEK_PREFIX_RE + ")[ ]*(?:周|星期)[ ]*([一二三四五六日天])$")
  );
  if (m1) {
    const rawPrefix = m1[1] || "";
    const target = DAY_MAP[m1[2]];
    const mondayBased = (base.getDay() + 6) % 7;
    const targetMondayBased = (target + 6) % 7;

    let weeksAhead;
    if (rawPrefix.startsWith("下下")) {
      weeksAhead = 2;
    } else if (rawPrefix.startsWith("下")) {
      weeksAhead = 1;
    } else {
      weeksAhead = 0;
    }

    let offset;
    if (weeksAhead === 0) {
      // 本周：目标日已过则顺延到下周
      offset = -mondayBased + targetMondayBased;
      if (offset < 0) offset += 7;
    } else {
      offset = weeksAhead * 7 - mondayBased + targetMondayBased;
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

  // 过X天 / 过X日 / 过X周 / 过X个星期 / 过X个月 / 过X年
  const mOver = s.match(
    new RegExp("^过([0-9一二三四五六七八九十两]+)(天|日|周|个星期|个月|年)$")
  );
  if (mOver) {
    const n = parseChineseNumber(mOver[1]);
    if (n === null || n <= 0) return null;

    const unit = mOver[2];
    if (unit === "天" || unit === "日") {
      if (n > 365) return null;
      return { date: addDays(base, n), normalized: formatCN(addDays(base, n)) };
    }
    if (unit === "周" || unit === "个星期") {
      if (n > 52) return null;
      return { date: addDays(base, n * 7), normalized: formatCN(addDays(base, n * 7)) };
    }
    if (unit === "个月") {
      if (n > 24) return null;
      return { date: addMonths(base, n), normalized: formatCN(addMonths(base, n)) };
    }
    if (unit === "年") {
      if (n > 10) return null;
      return { date: addMonths(base, n * 12), normalized: formatCN(addMonths(base, n * 12)) };
    }
    return null;
  }

  // X天内 / X天后 / X日内 / X日后
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

  // X个月内 / X个月后（“个”必须存在）
  const mMonth = s.match(
    new RegExp(
      "^([0-9一二三四五六七八九十两]+)个月(?:之内|以内|内|之后|以后|后)$"
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

  // X年内 / X年后（“个”可选）
  const mYear = s.match(
    new RegExp(
      "^([0-9一二三四五六七八九十两]+)个?年(?:之内|以内|内|之后|以后|后)$"
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

export function isResolvableRelativeDate(text) {
  return resolveRelativeDate(text, new Date()) !== null;
}