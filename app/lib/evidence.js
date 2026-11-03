/* eslint-disable no-control-regex */
// 纯逻辑：把原文里"看起来像时间/日期/地点/材料"的说法折算成规范值，
// 反查哪个说法等于界面显示的值，从而定位依据。
// 原则：找不到必须返回 null，绝不随便指一处——宁缺勿滥。

// ---------- 基础工具 ----------

const PERIODS = ["上午", "下午", "中午", "晚上", "凌晨", "早上", "早晨", "傍晚", "晚", "早"];

// 需要 +12 的时段词（长词优先，见下）
const PLUS_TWELVE = ["下午", "晚上", "傍晚", "晚", "中午"];

// 中文数字字符类，注意全部用字符类，不用 \d \s 之类
const NUM_CHAR = "[0-9一二三四五六七八九十两]";
const CN_DIGITS = {
  零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4,
  五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};

// 把一段中文或阿拉伯数字转成整数，支持到十以上（十五、二十、二十五…）
// 算不出来返回 null
export function parseNumber(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // 纯阿拉伯数字
  if (/^[0-9]+$/.test(s)) {
    return parseInt(s, 10);
  }

  // 只允许中文数字字符
  if (!/^[一二三四五六七八九十两]+$/.test(s)) return null;

  // 十 单独出现 = 10
  if (s === "十") return 10;

  const idx = s.indexOf("十");
  if (idx === -1) {
    // 没有十：只支持单个字符（一 两 三…），多字符直接判失败避免歧义
    if (s.length !== 1) return null;
    const v = CN_DIGITS[s];
    return v == null ? null : v;
  }

  // 出现十：形如 十五 / 二十 / 二十五
  const head = s.slice(0, idx);
  const tail = s.slice(idx + 1);
  let tens = 0;
  let ones = 0;

  if (head) {
    if (head.length !== 1) return null;
    const hv = CN_DIGITS[head];
    if (hv == null) return null;
    tens = hv * 10;
  } else {
    tens = 10;
  }

  if (tail) {
    if (tail.length !== 1) return null;
    const tv = CN_DIGITS[tail];
    if (tv == null) return null;
    ones = tv;
  }

  return tens + ones;
}

function pad2(n) {
  return n < 10 ? "0" + n : String(n);
}

// 把小时/分钟折成 HH:MM，越界返回 null
function formatHourMinute(hour, minute) {
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23) return null;
  if (minute < 0 || minute > 59) return null;
  return pad2(hour) + ":" + pad2(minute);
}

// 校验时段词是否合法全集
function isValidPeriod(p) {
  return PERIODS.indexOf(p) !== -1;
}

// ---------- 时间说法解析 ----------

// 输入一个时间说法，输出二十四小时制 HH:MM 字符串，算不出来返回 null
// 支持：下午5点 / 下午五点 / 晚7点 / 晚上七点 / 晚6点半 /
//       下午两点半 / 上午9点 / 早上七点 / 凌晨一点 / 中午十二点 /
//       十九点 / 十七点三十 / 17:00 / 十九点三十
export function normalizeTimePhrase(phrase) {
  if (phrase == null) return null;
  const raw = String(phrase).trim();
  if (!raw) return null;

  // 冒号写法：小时和分钟原样取，不折算
  const colonMatch = raw.match(/^([0-9]{1,2})[:：]([0-9]{2})$/);
  if (colonMatch) {
    const h = parseInt(colonMatch[1], 10);
    const m = parseInt(colonMatch[2], 10);
    return formatHourMinute(h, m);
  }

  // 带时段词的写法：时段词 + 数字 + 点 + 可选(半|数字)
  // 长词优先：上午/下午/中午/晚上/凌晨/早上/早晨/傍晚 先于 晚/早
  // 用字符类写法构造时段词的可选前缀（长的在前）
  const periodPrefix = "(上午|下午|中午|晚上|凌晨|早上|早晨|傍晚|晚|早)?";
  const re = new RegExp(
    "^" + periodPrefix + "(" + NUM_CHAR + "+)点(半|" + NUM_CHAR + "+)?$"
  );
  const m = raw.match(re);
  if (!m) return null;

  const period = m[1] || "";
  if (period && !isValidPeriod(period)) return null;

  const hourRaw = m[2];
  const hourNum = parseNumber(hourRaw);
  if (hourNum == null) return null;

  let minuteNum = 0;
  const minutePart = m[3];
  if (minutePart === "半") {
    minuteNum = 30;
  } else if (minutePart) {
    const mv = parseNumber(minutePart);
    if (mv == null) return null;
    minuteNum = mv;
  }

  // 分钟越界（>60 视为算不出来；=60 也视为不合法）
  if (minuteNum >= 60) return null;

  let hour = hourNum;

  // 时段词已确定：分钟先校验
  if (period) {
    // 带时段词时小时必须在 1..12（十二小时制说法），否则算不出来
    if (hour < 1 || hour > 12) return null;

    const isPlus = PLUS_TWELVE.indexOf(period) !== -1;
    if (period === "凌晨") {
      // 凌晨十二点 = 00:XX
      if (hour === 12) hour = 0;
      // 凌晨一点..十一点 保持原值
    } else if (isPlus) {
      // 十二点整不加（中午十二点=12:00），其余 +12
      if (hour !== 12) hour = hour + 12;
    } else {
      // 上午/早上/早晨/早：十二点视作 12，一点..十一点保持
      // 保持不变
    }
  } else {
    // 没有时段词：按二十四小时直接取
    if (hour < 0 || hour > 23) return null;
  }

  return formatHourMinute(hour, minuteNum);
}

// ---------- 在 scope 里枚举时间说法 ----------
// 返回 [{ value, quote, start, end }]，start/end 是相对 scope 的偏移

// 有序候选列表（长的时段词在前，避免"晚"抢走"晚上"）
function timeCandidateRegex(source) {
  // 构造匹配：时段词? 数字 点 (半|数字)?  |  已含点的说法后面不能再接数字点
  // 或者冒号写法 HH:MM
  // 用全局匹配逐个尝试。为支持"长词优先"，候选里长时段词放在前面，
  // 解析时用同一套规则（parseNumber / 时段折算）。
  const periodAlt = "(上午|下午|中午|晚上|凌晨|早上|早晨|傍晚|晚|早)";
  const body =
    "(" + NUM_CHAR + "+)点(半|" + NUM_CHAR + "+)?";

  // 因为有可选前缀，为避免"晚"先于"晚上"命中，
  // 我们先枚举数字+点的核心位置，再向前尝试吃掉时段词（长词优先）。
  const coreRe = new RegExp("(" + NUM_CHAR + "+)点(半|" + NUM_CHAR + "+)?", "g");

  const colonRe = /([0-9]{1,2})[:：]([0-9]{2})/g;

  const results = [];

  // 先收集冒号写法
  let cm;
  colonRe.lastIndex = 0;
  while ((cm = colonRe.exec(source)) !== null) {
    const quote = cm[0];
    const value = normalizeTimePhrase(quote);
    if (value) {
      results.push({ value, quote, start: cm.index, end: cm.index + quote.length });
    }
  }

  // 再收集 点 写法，并向前尝试读取时段词
  let m;
  coreRe.lastIndex = 0;
  while ((m = coreRe.exec(source)) !== null) {
    const coreStart = m.index;
    // 向前尝试匹配时段词：按长度从长到短尝试，取最长能匹配上的
    let period = "";
    let periodStart = coreStart;
    // 排序：长的优先
    const sortedPeriods = PERIODS.slice().sort((a, b) => b.length - a.length);
    for (let i = 0; i < sortedPeriods.length; i++) {
      const p = sortedPeriods[i];
      const ps = coreStart - p.length;
      if (ps >= 0 && source.slice(ps, coreStart) === p) {
        // 长词优先：只在还没有更长的匹配时采用
        if (p.length > period.length) {
          period = p;
          periodStart = ps;
        }
      }
    }

    // 但要排除：时段词紧跟在另一个数字后（例如"3点5点"里的第二个）——此处简单处理
    // 组合完整 quote
    const quote = source.slice(periodStart, m.index + m[0].length);
    const value = normalizeTimePhrase(quote);
    if (value) {
      results.push({
        value,
        quote,
        start: periodStart,
        end: m.index + m[0].length,
      });
    }
  }

  // 去重（相同位置相同 value 只保留一个）
  const seen = {};
  const dedup = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const key = r.start + "|" + r.end + "|" + r.value;
    if (!seen[key]) {
      seen[key] = true;
      dedup.push(r);
    }
  }
  // 按 start 排序，长 quote 优先（同一位置覆盖更全的）
  dedup.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return b.end - a.end;
  });

  return dedup;
}

// 在 scope 里找折算后等于 target 的时间说法，返回定位对象或 null
// target 形如 "17:00"，offset 是 scope 在整篇原文里的起始偏移
export function findTimePhrase(scope, target, offset) {
  if (!scope || target == null) return null;
  const targetNorm = String(target).trim();
  if (!targetNorm) return null;
  const base = Number.isInteger(offset) ? offset : 0;

  const candidates = timeCandidateRegex(scope);
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (c.value === targetNorm || normalizeTimePhrase(targetNorm) === c.value) {
      // 直接 value 相等或 target 本身也是说法
    }
    if (c.value === targetNorm) {
      return {
        value: c.value,
        quote: c.quote,
        start: base + c.start,
        end: base + c.end,
      };
    }
  }

  // 若 target 本身也是时间说法，用它折算后的值再比一次（例如 target="下午5点"）
  const targetAsPhrase = normalizeTimePhrase(targetNorm);
  if (targetAsPhrase) {
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      if (c.value === targetAsPhrase) {
        return {
          value: c.value,
          quote: c.quote,
          start: base + c.start,
          end: base + c.end,
        };
      }
    }
  }

  return null;
}

// ---------- 日期定位 ----------

// 生成候选日期说法（相对 scope 偏移）：
// 允许带年份、不带年份、只留数字
function dateCandidateList(scope) {
  const out = [];
  // 只找数字与常见分隔的连续片段，交给上层做多重尝试
  // 这里不做过宽匹配，按「年 月 日」的组合生成候选
  const re = /([0-9一二三四五六七八九十两]{1,4}年)?([0-9一二三四五六七八九十两]{1,2}月)?([0-9一二三四五六七八九十两]{1,3}[日号])/g;
  let m;
  re.lastIndex = 0;
  while ((m = re.exec(scope)) !== null) {
    const quote = m[0];
    out.push({
      quote,
      start: m.index,
      end: m.index + quote.length,
      year: m[1] || "",
      month: m[2] || "",
      day: m[3] || "",
    });
  }
  return out;
}

function stripToDigits(s) {
  return String(s).replace(/[^0-9一二三四五六七八九十两]/g, "");
}

// 在 scope 里找日期，支持去年份、去年月日
// target 形如 "2024年11月5日" 或 "11月5日"
export function findDatePhrase(scope, target, offset) {
  if (!scope || target == null) return null;
  const base = Number.isInteger(offset) ? offset : 0;
  const t = String(target).trim();
  if (!t) return null;

  // 1) 原样查找
  const exact = scope.indexOf(t);
  if (exact !== -1) {
    return { value: t, quote: t, start: base + exact, end: base + exact + t.length };
  }

  // 2) 去掉年份后再找：目标形如 2024年11月5日 -> 11月5日
  const noYear = t.replace(/^[0-9一二三四五六七八九十两]{1,4}年/, "");
  if (noYear && noYear !== t) {
    const hit = scope.indexOf(noYear);
    if (hit !== -1) {
      return {
        value: noYear,
        quote: noYear,
        start: base + hit,
        end: base + hit + noYear.length,
      };
    }
  }

  // 3) 去掉年/月/日字，只留数字去比（按候选片段里数字序列相等）
  const targetDigits = stripToDigits(t);
  if (targetDigits) {
    const cands = dateCandidateList(scope);
    for (let i = 0; i < cands.length; i++) {
      const c = cands[i];
      const candDigits = stripToDigits(c.quote);
      if (!candDigits) continue;
      // 目标可能带年份而候选不带：以「目标以候选数字结尾」或「完全相等」判
      if (candDigits === targetDigits || targetDigits.endsWith(candDigits)) {
        return {
          value: c.quote,
          quote: c.quote,
          start: base + c.start,
          end: base + c.end,
        };
      }
    }
  }

  return null;
}

// ---------- 原样查找：地点、材料 ----------

// 原样查找，地点和材料用。找不到返回 null。
export function findPlainPhrase(scope, target, offset) {
  if (!scope || target == null) return null;
  const base = Number.isInteger(offset) ? offset : 0;
  const t = String(target).trim();
  if (!t) return null;
  const idx = scope.indexOf(t);
  if (idx === -1) return null;
  return { value: t, quote: t, start: base + idx, end: base + idx + t.length };
}

// ---------- 给一个事项生成整体依据 ----------

// fullText 整篇原文；sentence { text, start }；item { date,dateText,time,location,materials }
// 返回 { quote, start, end, fields }，fields 里找不到的字段不放入。
export function buildItemEvidence(fullText, sentence, item) {
  if (!fullText || !sentence || !item) return null;
  const scope = sentence.text != null ? String(sentence.text) : "";
  const base = Number.isInteger(sentence.start) ? sentence.start : 0;
  if (!scope) return null;

  const fields = {};

  // 时间
  if (item.time) {
    const t = findTimePhrase(scope, item.time, base);
    if (t) fields.time = t;
  }

  // 日期：优先 date，其次 dateText
  const dateTarget = item.date || item.dateText;
  if (dateTarget) {
    const d = findDatePhrase(scope, dateTarget, base);
    if (d) fields.date = d;
  }

  // 地点
  if (item.location) {
    const loc = findPlainPhrase(scope, item.location, base);
    if (loc) fields.location = loc;
  }

  // 材料：数组，逐一定位，找不到整组就不放
  if (Array.isArray(item.materials) && item.materials.length > 0) {
    const matSpans = [];
    let allFound = true;
    for (let i = 0; i < item.materials.length; i++) {
      const name = item.materials[i];
      if (name == null) {
        allFound = false;
        break;
      }
      const span = findPlainPhrase(scope, name, base);
      if (!span) {
        allFound = false;
        break;
      }
      matSpans.push(span);
    }
    if (allFound && matSpans.length > 0) {
      fields.materials = matSpans;
    }
  }

  return {
    quote: scope,
    start: base,
    end: base + scope.length,
    fields: fields,
  };
}
