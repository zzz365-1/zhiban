/**
 * 相对日期的本地确定性换算。纯函数，不依赖网络、不依赖 AI、不依赖密钥。
 *
 * 【为什么不用 AI 算日期】
 * 模型的本质是概率预测，对“一周从哪天开始”“本月有没有 31 日”这类
 * 确定性的日历规则没有稳定认知。同一个输入可能今天对、明天错，
 * 而界面上完全看不出来。用户按错误的日期去办事，后果由用户承担。
 * 所以所有能确定换算的说法都在本地用纯函数做，AI 只负责“从原文里选
 * 哪个日期是用户要赶的”。
 *
 * 【一周从星期一开始，周日是最后一天】
 * 这个规则贯穿整个文件。任何“本周X”“下周三”的计算都基于此。
 * 不能用 JS 默认的 getDay() 结果（0=周日）直接算周几偏移，
 * 必须先转换成 (getDay() + 6) % 7，把周日变成 6。
 *
 * 【为什么“X月”必须带“个”】
 * “一月”“二月”……“十二月”本身也是月份名。“三月之后”可以理解为
 * “三月份过完之后”，也可以理解为“三个月之后”，语义含糊。
 * 所以只有带“个”的“X个月”才按时间长度处理；不带“个”的“X月后/内”
 * 一律返回 null，交给 AI 兜底。宁可空着，也不要猜错。
 *
 * 【为什么“一周后”= 7 个自然日，不是 5 个工作日】
 * 校园通知里的“一周后”指日历周，跨周末是正常的。按工作日算反而会让
 * 用户对不上实际日期（周五收到的通知，“一周后”按工作日算是下周五，
 * 按自然日算是下周五，但下周一就是“一周后”的第一个工作日了）。
 * 用户拿到一个错的日期，到场时人家说“截止日期是下周五”，白跑一趟。
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
 * “一个月后”按自然月计算（1月31日 + 1月 = 2月28/29日），不是 30 天。
 */

const DAY_MAP = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };

const CN_DIGITS = {
  一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5,
  六: 6, 七: 7, 八: 8, 九: 9,
};

/**
 * 周几前缀正则。长前缀放前面，避免“下”抢在“下下”“下个”之前匹配。
 * 前缀分类（决定加几周）：
 *   - 以“下下”开头 → +2 周
 *   - 以“下”开头（下/下个/下一个/下一周/下个星期） → +1 周
 *   - 本/这/这个/这一个/本周/本星期/这个星期/这一个星期/省略 → 本周（已过则顺延）
 *
 * 【为什么长前缀必须写在前面】
 * 正则选择是“先到先得”。“下下个星期三”如果让“下”先匹配，
 * 剩下“下个星期三”，再匹配“下个”+“星期三”，结果还是对；
 * 但“下一个星期三”如果让“下”先匹配，剩下“一个星期三”，就匹配不上了。
 * 所以要把“下一个”“这一个”这些长前缀放在“下”“这”之前。
 */
const WEEK_PREFIX_RE =
  "(?:下下个星期|下下个|下下|下一个|下个星期|这个星期|这一个星期|下一个|本星期|下一周|下个|这个|这一个|本周|下|本|这)?";

/**
 * 解析中文数字（一到九十九）或纯阿拉伯数字。
 * 支持：三、十、十五、二十、二十三、3、15。
 * 无法解析返回 null（例如“几”“两”开头的复合数、“百”“千”）。
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
 * 例：2026-01-31 + 1 个月 = 2026-02-28（平年 2 月只有 28 天）
 *     2024-01-31 + 1 个月 = 2024-02-29（闰年 2 月有 29 天）
 *     2026-03-31 + 1 个月 = 2026-04-30（4 月只有 30 天）
 *
 * 【为什么不用“加 30 天”】
 * 用户说“一个月后”是让程序按日历加一个月，不是加固定天数。
 * “加 30 天”在 1 月 15 日会给 2 月 14 日，但用户期望是 2 月 15 日。
 * 差一天，就可能误事。校园通知里交材料的截止日期差一天足够出问题。
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

function isQuantityRelativePhrase(s) {
  return new RegExp(
    "^[0-9一二三四五六七八九十两半]+(?:天|日|周|个星期|个月|年|季度)$"
  ).test(s);
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
  let s = String(text || "").trim();
  if (!s) return null;

  // 截止后缀预处理：结尾的“之前/以前/前”先摘掉。
  // 但“三天前/两周前/一个月前”这类数量型说法指过去，不能当未来截止日算，
  // 所以摘掉后缀后如果是纯数量型短语，直接返回 null，交给模型兜底。
  const deadlineSuffix = s.match(new RegExp("(之前|以前|前)$"));
  if (deadlineSuffix) {
    s = s.slice(0, -deadlineSuffix[0].length).trim();

    // “本周五中午前”去掉“前”后还剩“本周五中午”，把时段词也摘掉，
    // 让“本周五”继续走下面的星期解析。
    const timeOfDay = s.match(
      new RegExp("(凌晨|早上|上午|中午|下午|傍晚|晚上)$")
    );
    if (timeOfDay) {
      s = s.slice(0, -timeOfDay[0].length).trim();
    }

    if (isQuantityRelativePhrase(s)) {
      return null;
    }
  }

  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // 今天 / 明天 / 后天 / 大后天 / 次日 / 隔天 / 即日
  // 次日 = 明天，隔天 = 明天，即日 = 今天——都是通知里常见的等价说法
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
  // 公式：
  //   本周：offset = targetMondayBased - mondayBased；若 < 0 则 +7（已过顺延）
  //   下周：offset = 7 - mondayBased + targetMondayBased
  //   下下周：offset = 14 - mondayBased + targetMondayBased
  // 这里 mondayBased = (getDay() + 6) % 7，把“周日”变成 6（一周最后一天）。
  // 不能直接用 getDay()，否则周日会被当成一周第一天，导致“下周三”多算一周。
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
      offset = -mondayBased + targetMondayBased;
      if (offset < 0) offset += 7;
    } else {
      offset = weeksAhead * 7 - mondayBased + targetMondayBased;
    }

    const d = addDays(base, offset);
    return { date: d, normalized: formatCN(d) };
  }

  // 本月底 / 本月末
  // new Date(y, m+1, 0) 是“下个月第 0 天”= 本月最后一天，
  // 自动处理 28/29/30/31 天的月份差异
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
  // new Date(y, m+2, 0) = 下下个月第 0 天 = 下月最后一天，跨年自动处理
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
  // 需要校验日期合法性：new Date(2026, 1, 30) 会溢出到 3 月 2 日，
  // 必须用“年/月/日三者都对得上”的方式校验，否则会把 2 月 30 日
  // 当成合法日期返回一个 3 月 2 日的错误结果。
  // 本月的日期如果已过（< 今天 0 点），返回 null，不猜是否顺延。
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
  // “过三天”和“三天后”语义相同，结果也相同（都是 +3 天）。
  // “X周”和“X个星期”语义相同，+X*7 天。
  // “X个月”必须带“个”，避免“三月之后”被误解为“三个月后”。
  // 上限保护：天 ≤ 365，周 ≤ 52，月 ≤ 24，年 ≤ 10，超过视为异常输入返回 null。
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

  // 半个月 / 半年 / 一季度
  // “半个月”按 15 天算；“半年”按 6 个自然月；“一季度”按 3 个自然月。
  const mHalfMonth = s.match(
    new RegExp("^(?:过半个月|半个月(?:之内|以内|内|之后|以后|后))$")
  );
  if (mHalfMonth) {
    const d = addDays(base, 15);
    return { date: d, normalized: formatCN(d) };
  }

  const mHalfYear = s.match(
    new RegExp("^(?:过半年|半年(?:之内|以内|内|之后|以后|后))$")
  );
  if (mHalfYear) {
    const d = addMonths(base, 6);
    return { date: d, normalized: formatCN(d) };
  }

  const mQuarter = s.match(
    new RegExp("^(?:过一季度|一季度(?:之内|以内|内|之后|以后|后))$")
  );
  if (mQuarter) {
    const d = addMonths(base, 3);
    return { date: d, normalized: formatCN(d) };
  }

  // X天内 / X天后 / X日内 / X日后
  // “X天内”语义上是“最晚第 X 天”，所以结果和“X天后”相同。
  // 用户会按最后一天行事，这就是“X天内”的实际意义。
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

  // X个月内 / X个月后
  // 【为什么“个”必须存在，不能是 (?:个)?】
  // “一月”“三月”本身是月份名，“三月之后”语义含糊。带“个”的“X个月”
  // 明确表示时间长度，不带“个”的“X月”不做换算，交给 AI 判断。
  // 这是上一轮针对用户反馈“三月之后”被算成“三个月后”的修复。
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

  // X年内 / X年后
  // 年和月份名不冲突（“一年”不会被当成 1 月份），所以“个”可选。
  // “一年后”= 加 12 个月 = 加 1 自然年，闰年 2 月 29 日 + 1 年 = 次年 2 月 28 日。
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

// ---------- 中文数字日期转阿拉伯数字 ----------

const CN_DIGIT = {
  零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4,
  五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};

const CN_UNIT = { 十: 10, 百: 100, 千: 1000 };

function cnNumberToInt(str) {
  if (!str) return null;
  if (new RegExp("^[0-9]+$").test(str)) return Number(str);

  // 逐位写法，比如二〇二六和一二三
  if (new RegExp("^[零〇一二两三四五六七八九]+$").test(str)) {
    let v = 0;
    for (const ch of str) v = v * 10 + CN_DIGIT[ch];
    return v > 0 ? v : null;
  }

  // 含十百千的写法，比如十五和二十三和三十一
  // 注意十单独出现时表示一个十，不能当成零
  let total = 0;
  let cur = 0;
  for (const ch of str) {
    if (ch in CN_DIGIT) {
      cur = CN_DIGIT[ch];
    } else if (ch in CN_UNIT) {
      total += (cur === 0 ? 1 : cur) * CN_UNIT[ch];
      cur = 0;
    }
  }
  total += cur;
  return total > 0 ? total : null;
}

const CN_FULL_DATE_RE = new RegExp(
  "([零〇一二两三四五六七八九十]{2,4})年([一二三四五六七八九十]{1,3})月([一二三四五六七八九十]{1,3})[日号]",
  "g"
);

const CN_MONTH_DAY_RE = new RegExp(
  "([一二三四五六七八九十]{1,3})月([一二三四五六七八九十]{1,3})[日号]",
  "g"
);

// 把中文数字写的日期换成阿拉伯数字，让后面的解析和日历都能用。
// 真实踩过坑：通知里写请于二〇二六年十一月十五日前报送，
// 模型能把这一串抽出来，但是转不成具体日期，日历加不进去。
export function normalizeChineseDate(text) {
  if (!text || typeof text !== "string") return text;
  let out = text.replace(CN_FULL_DATE_RE, (m, y, mo, d) => {
    const yy = cnNumberToInt(y);
    const mm = cnNumberToInt(mo);
    const dd = cnNumberToInt(d);
    if (yy == null || mm == null || dd == null) return m;
    return yy + "年" + mm + "月" + dd + "日";
  });
  out = out.replace(CN_MONTH_DAY_RE, (m, mo, d) => {
    const mm = cnNumberToInt(mo);
    const dd = cnNumberToInt(d);
    if (mm == null || dd == null) return m;
    return mm + "月" + dd + "日";
  });
  return out;
}