/**
 * 规则式通知信息提取器
 *
 * 全文件避免正则反斜杠：数字用 [0-9]、空白用 [ ]、中文用 [一-龥]。
 * 原因：这个项目在反斜杠转义上连续栽过三次跟头——同一份正则，
 * 从字面量改成字符串再改回来，`\\\\d` 和 `\\d` 来回切，一次改坏就是
 * “日期永远抽不出来”，而界面上看不出来，得靠脚本才能发现。
 * 所以定下规矩：任何含反斜杠的正则都拆成字符类或用 String.fromCharCode
 * 拼装，从此这类 bug 绝迹。
 *
 * 【日期为什么在这里只抽不换算】
 * 这个文件负责“从原文里把可能的日期文本抓出来”，
 * 比如把“下周三”“三天内”“一个月后”原样抽出。
 * 具体换算（下周三 = 哪一天、三天内 = 哪一天）由 relativeDate.js 本地做。
 * 分开的原因：抓取靠模式匹配（快、可测），换算靠日历逻辑（需要基准日期、月份天数）。
 * 两者混在一起，改动一处容易连带影响另一处。
 *
 * 【模糊日期为什么必须触发 AI 兜底】
 * 抽出“明天”“下周三”这种文本但算不出具体日期，对用户来说等于“未识别”。
 * 用户看到“下周三”这个字符串也没法行事。所以 isRuleResultGood 判定
 * 模糊日期为“未抽到”，触发 AI 兜底（注：现在大多数相对日期本地能换算，
 * 只有 local 也算不出来时才真正兜底到 AI）。
 */

const LF = String.fromCharCode(10);
const CRLF = String.fromCharCode(13, 10);

// 周期说法与教学周：这些不是某一天要干什么，是按周期重复。
// 真实踩过坑：原文每周三下午三点在行政楼会议室召开例会，
// 抽出来是周三，本地换算成一个具体日期，界面显示得跟真截止一模一样，
// 用户以为那天要办事，实际上每周都开，没有那一天。
// 教学周第12周依赖校历，硬算出来是猜的，宁可空着。
// 匹配窗口尾部，也就是日期紧前面就是这些字。
// 真实踩过坑：抽出来的候选文本是周三，每字在候选区间之外，
// 第一版靠匹配候选文本开头来挡，永远发不中，
// 于是每周三前交一路走到末尾只剩一个候选的兜底，把周三返回了，
// 界面显示一个看起来跟真截止一样的日期。
// 同一条通知里既有每周三开会又有本月25日前交表时，
// 只扔掉周三这个候选，本月25日前面的窗口不含每，照常保留。
const RECURRING_DATE = new RegExp(
  "(?:每[逢隔个]?|第[0-9一二三四五六七八九十]+[ ]*(?:周|星期))[ ]*$"
);

// ---------- 日期 ----------

// 周几前缀：长前缀放前面，避免“下”抢在“下下”“下个”之前匹配。
// 支持“周三”“本周三”“这周三”“这个星期三”“下个星期三”“下一个星期三”“下下周三”等。
const WEEK_PREFIX_SRC =
  "(?:下下个星期|下下个|下下|下一个|下个星期|这个星期|这一个星期|下一个|本星期|下一周|下个|这个|这一个|本周|下|本|这)?";

const DATE_SOURCES = [
  // 2026-11-15 / 2026/11/15 / 2026年11月15日 / 2026.11.15
  { source: "([0-9]{4})[ ]*[-/年.][ ]*([0-9]{1,2})[ ]*[-/月.][ ]*([0-9]{1,2})[ ]*[日号]?", flags: "g" },

  // 11月15日 / 11月15号
  { source: "([0-9]{1,2})[ ]*月[ ]*([0-9]{1,2})[ ]*[日号]", flags: "g" },

  // 11/15 / 11-15（前后不接数字，避免匹配到时间或更长的数字串）
  { source: "(?<![0-9])([0-9]{1,2})[ ]*[-/][ ]*([0-9]{1,2})(?![0-9])", flags: "g" },

  // 周几：支持省略前缀（周三）、本周三、这周三、这个星期三、
  // 下周三、下个星期三、下一个星期三、下一周周三、下下周三、下下个星期三
  { source: WEEK_PREFIX_SRC + "[ ]*(?:周|星期)[ ]*[一二三四五六日天]", flags: "g" },

  // 相对日：今天 / 明天 / 后天 / 大后天 / 次日 / 隔天 / 即日
  { source: "(?:大后天|后天|明天|今天|次日|隔天|即日)", flags: "g" },

  // 本月25日 / 下月5日
  { source: "(?:本月|下月)[0-9]{1,2}[ ]*[日号]", flags: "g" },

  // 本月底 / 本月初 / 下月底 / 10月底（“底/初/末”必须有，不接受光秃秃的“本月”）
  { source: "(?:[0-9]{1,2}[ ]*月[底初末]|本月[底初末]|下月[底初末])", flags: "g" },

  // 过X天/日/周/个星期/个月/年，或 X天/日/周/个星期/个月/年后缀
  // 【为什么“个月”必须带“个”】
  // “三月之后”语义含糊（3月过完 vs 3个月后），不在这里识别月份长度，
  // 只识别“X个月后/内”这种带“个”的明确表达。
  // 【为什么后缀（内/后/之后等）不能省】
  // 单纯“三天”语义模糊，可能指“三天内”也可能指“三天后”，
  // 不在这里猜，只识别带“过”前缀或带后缀的完整说法。
  { source: "(?:过[0-9一二三四五六七八九十两]+(?:天|日|周|个星期|个月|年)|[0-9一二三四五六七八九十两]+(?:天|日|周|个?星期|个月|年)(?:之内|以内|内|之后|以后|后))", flags: "g" },

  // X周内 / X周后 / X个星期内 / X个星期后（无“过”前缀但有“个”）
  { source: "([0-9一二三四五六七八九十两]+)(?:周|个?星期)(?:之内|以内|内|之后|以后|后)", flags: "g" },

  // X个月内 / X个月后（“个”必须）
  { source: "([0-9一二三四五六七八九十两]+)个月(?:之内|以内|内|之后|以后|后)", flags: "g" },

  // X年内 / X年后（“个”可选，年和月份名不冲突）
  { source: "([0-9一二三四五六七八九十两]+)个?年(?:之内|以内|内|之后|以后|后)", flags: "g" },
];

// 残缺日期：光秃秃的“本周”“下月”等，对用户没有意义，不作为日期
const INCOMPLETE_DATE = new RegExp(
  "^(本周|这周|下周|本星期|这星期|下星期|本月|下月)$"
);

function findDateCandidates(text) {
  const found = [];
  for (const { source, flags } of DATE_SOURCES) {
    const re = new RegExp(source, flags);
    let m;
    while ((m = re.exec(text)) !== null) {
      found.push({
        text: m[0].trim(),
        index: m.index,
        end: m.index + m[0].length,
        length: m[0].length,
      });
    }
  }
  // 按位置排序；同一位置保留更长的（例如“这个星期三”优先于“星期三”）
  found.sort((a, b) => a.index - b.index || b.length - a.length);
  const result = [];
  for (const d of found) {
    if (!result.some((k) => d.index < k.end && d.end > k.index)) result.push(d);
  }
  return result;
}

const DEADLINE_MARKERS = new RegExp(
  "(截止|截至|期限|之前|以前|前完成|前提交|前报送|前将|前上传|前交)"
);

/**
 * 从原文里选“用户要赶的那个日期”。
 *
 * 有截止标志（截止/截至/之前/前…）的日期优先；只有一个候选直接用它；
 * 多个候选又没有截止标志则返回 null——宁可不给，也不要随便挑一个。
 */
/**
 * 判断一个日期候选是否位于落款或者发文日期的位置。
 *
 * 为什么不能简单按只出现一次就不要来判断。
 * 请于六月二十日前交表这种只出现一次，但它是真的截止时间，必须保留。
 * 所以按位置判：日期所在行除了日期只剩单位名或者空，且在文首或文末的少数行内，视为落款。
 *
 * 覆盖的落款形态
 *   文末 单位独占一行 日期独占下一行
 *   文末 日期与单位同一行
 *   开头 第一行单位 第二行日期
 *   开头 日期与单位同一行
 */

// 单位名常见收尾特征
function looksLikeIssuerLine(line) {
  const t = line.trim();
  if (!t) return true;
  if (t.length > 25) return false;
  return new RegExp(
    "(处|部|办公室|办|学院|院|系|室|中心|公司|学校|大学|党委|团委|学生会|工会|学会|协会|委员会|秘书处|教研室)$"
  ).test(t);
}

function isSignatureDate(text, cand) {
  const lines = text.split(LF);
  let pos = 0;
  const lineRanges = [];
  for (const line of lines) {
    lineRanges.push({ start: pos, end: pos + line.length, line });
    pos += line.length + 1;
  }

  let hit = -1;
  for (let i = 0; i < lineRanges.length; i++) {
    const r = lineRanges[i];
    if (cand.index >= r.start && cand.end <= r.end) {
      hit = i;
      break;
    }
  }
  if (hit === -1) return false;

  const line = lineRanges[hit].line;
  const beforeOnLine = line.slice(0, cand.index - lineRanges[hit].start).trim();
  const afterOnLine = line.slice(cand.end - lineRanges[hit].start).trim();

  // 【截止词优先于落款判断】
  // 真实踩过坑：请于12月31日前将表交到教务处
  //   日期后面剩 前将表交到教务处，整段以处结尾，被 looksLikeIssuerLine 判成单位名，
  //   真截止日期被当落款扔掉，界面上日期是空的还不报错。
  // 所以先看日期前后有没有截止标志，有就一定是真截止，不论位置、不论后面是否像单位名。
  const aroundForDeadline = line.slice(
    Math.max(0, cand.index - lineRanges[hit].start - 15),
    Math.min(line.length, cand.end - lineRanges[hit].start + 15)
  );
  if (
    DEADLINE_MARKERS.test(aroundForDeadline) ||
    new RegExp("^[ ]*前").test(afterOnLine)
  ) {
    return false;
  }

  // 前后还有实质内容（非单位名）同样不是落款。
  // 只有这一行除了日期就只剩单位名或者空，才可能是落款。
  const beforeIsIssuer = beforeOnLine === "" || looksLikeIssuerLine(beforeOnLine);
  const afterIsIssuer = afterOnLine === "" || looksLikeIssuerLine(afterOnLine);
  if (beforeOnLine !== "" && !beforeIsIssuer) return false;
  if (afterOnLine !== "" && !afterIsIssuer) return false;

  // 位置约束：文首前 3 行或者文末后 3 行
  const lineCount = lines.length;
  const nearStart = hit <= 2;
  const nearEnd = hit >= lineCount - 3;
  return nearStart || nearEnd;
}

// 日期后面紧跟的截止说法。
// 【为什么要把时间也写进来】
// 真实踩过坑：请于11月5日下午5点前将报名表发至邮箱。比赛定于11月8日晚7点举行。
//   原来只看日期后面五个字，11月5日后面是下午5点前，五个字刚好被时间占满，
//   前字落在窗口外面，截止标志等于没看见，11月5日被跳过。
//   而11月8日后面是晚7点在大学生，同样没有标志，两个候选都没标志，
//   函数直接返回空，界面上日期是空的，全丢给模型去猜。
// 所以日期后面允许先夹一个时间点再接前字，窗口也放宽到十二个字。
// 【为什么要先截断到标点】
// 会议11月8日举行，请11月5日前交表。
//   11月8日后面十二个字是举行，请11月5日前，末尾正好有个前字，
//   不截断就会把开会日期误当成截止日，比不识别更糟。
const DEADLINE_AFTER_RE = new RegExp(
  "^[ ]*(?:(?:上午|下午|中午|晚上|晚|凌晨|早上|早晨|傍晚)[ ]*)?" +
    "(?:[0-9]{1,2}[ ]*[点时](?:[ ]*[0-9]{1,2}[ ]*分?)?(?:[ ]*半)?[ ]*)?" +
    "(?:之前|以前|截止|截至|前)"
);

function clauseAfterSlice(text, end) {
  let s = text.slice(end, Math.min(text.length, end + 12));
  const p = s.search(/[，。；;！？、\n]/);
  if (p !== -1) s = s.slice(0, p);
  return s;
}

function extractDeadlineCandidate(text) {
  const candidates = findDateCandidates(text).filter((c) => {
    if (INCOMPLETE_DATE.test(c.text)) return false;
    if (isSignatureDate(text, c)) return false;
    // 看紧邻候选起点前面那几个字，而不是看候选文本本身。
    const nearBefore = text.slice(Math.max(0, c.index - 6), c.index);
    if (RECURRING_DATE.test(nearBefore)) return false;
    return true;
  });
  if (candidates.length === 0) return null;
  for (const d of candidates) {
    const before = text.slice(Math.max(0, d.index - 15), d.index);
    const after = clauseAfterSlice(text, d.end);
    // 再看日期紧前面是不是每或者第几周这类周期引导。
    // 每逢周一前交表会抽出周一，靠这里挡掉，不能当成截止日。
    const nearBefore = text.slice(Math.max(0, d.index - 6), d.index);
    if (
      new RegExp("(每|第[0-9一二三四五六七八九十]+[ ]*(?:周|星期))[ ]*$").test(
        nearBefore
      )
    ) {
      continue;
    }
    if (DEADLINE_MARKERS.test(before) || DEADLINE_AFTER_RE.test(after)) return d;
  }
  if (candidates.length === 1) return candidates[0];
  return null;
}

function extractDeadline(text) {
  const d = extractDeadlineCandidate(text);
  return d ? d.text : null;
}

// ---------- 活动日期 ----------

// 活动或者会议的引导词，写在日期前面。
// 【为什么需要】
// 一条通知里常常有两个日期，前面那个是要赶的截止日，后面那个是活动举办日。
// 之前只有一个日期字段，举办日要么被当成截止日抢走，要么干脆没人管，
// 用户拿着通知还是不知道活动哪天办。这里把它单独抽出来。
const EVENT_BEFORE_RE = new RegExp(
  "(?:定于|定在|将于|计划于|拟于|安排在|比赛|大赛|活动|会议|评审会|评议会|" +
    "评委会|班会|讲座|培训|演出|仪式|典礼|开幕式|初赛|复赛|决赛|开赛|" +
    "展览|论坛|答辩|体检|面试|考试|报到|集合)[ ]*$"
);

// 举办类动词，写在日期后面，日期和时间之间允许夹一个时间点。
const EVENT_AFTER_RE = new RegExp(
  "^[ ]*(?:(?:上午|下午|中午|晚上|晚|凌晨|早上|早晨|傍晚)[ ]*)?" +
    "(?:[0-9]{1,2}[ ]*[点时](?:[ ]*[0-9]{1,2}[ ]*分?)?(?:[ ]*半)?[ ]*)?" +
    "(?:举行|举办|召开|进行|开始|开赛|开幕|开展|启动|上课|开课|报到|集合|" +
    "初赛|复赛|决赛|演出|放映|开馆|开放|答辩|面试|体检)"
);

/**
 * 抽活动或者会议举办的日子。
 *
 * 【宁缺勿滥】
 * 只有明确出现举办类说法才给值。拿不准就返回空，界面上不显示这一行，
 * 也比给一个错的日期强。
 *
 * 【为什么不返回和截止日同一天的那个】
 * 报名11月5日截止，会议11月5日下午3点开，这种情况界面上已经有一行11月5日了，
 * 再显示一行活动日期还是11月5日，看着像程序出错。所以同一天就不重复给。
 */
function extractEventDateCandidate(text, deadlineCand) {
  const candidates = findDateCandidates(text).filter((c) => {
    if (INCOMPLETE_DATE.test(c.text)) return false;
    if (isSignatureDate(text, c)) return false;
    const nearBefore = text.slice(Math.max(0, c.index - 6), c.index);
    if (RECURRING_DATE.test(nearBefore)) return false;
    return true;
  });
  for (const c of candidates) {
    if (deadlineCand) {
      if (c.index === deadlineCand.index) continue;
      if (deadlineCand.text === c.text) continue;
    }
    const before = text.slice(Math.max(0, c.index - 15), c.index);
    const after = clauseAfterSlice(text, c.end);
    if (EVENT_BEFORE_RE.test(before) || EVENT_AFTER_RE.test(after)) {
      return c;
    }
  }
  return null;
}

function extractEventDate(text, deadlineCand) {
  const c = extractEventDateCandidate(text, deadlineCand);
  return c ? c.text : null;
}

// ---------- 时间 ----------

/**
 * 抽具体时间。
 *
 * 【为什么要限搜索范围】
 * 真实踩过坑：请各学院于11月2日前将材料报送至中心。评审会定于11月3日晚7点举行。
 *   日期抽的是11月2日，时间却从全文里抓到晚7点，那是评审会的时间，
 *   界面上拼成11月2日19点，看着像那么回事，其实是两个日期的孩子拼在一起。
 * 所以给了截止日期就只在它前后这一小段里找时间，找不到就当没有。
 * 没有截止日期时保持原来的全文找法，不动老用例。
 */
// 分句边界。日期和时间必须落在同一小句里才算同源。
const CLAUSE_SPLIT = /[，。；;！？、\n]/;

/**
 * 取出日期所在的那一小句，只在里面找时间。
 *
 * 【为什么不能只按字数取窗口】
 * 真实踩过坑：报名截止11月5日，比赛定于11月8日晚7点开始。
 *   按字数前后各取一段，逗号后面的晚7点也被框进来了，
 *   截止日11月5日又挂上了19点，串台照旧。
 * 所以先按标点切出这一句，再在句子里找。句子本身太长才退化成按字数截断。
 */
function timeScopeFor(text, cand) {
  let start = 0;
  for (let i = cand.index - 1; i >= 0; i--) {
    if (CLAUSE_SPLIT.test(text[i])) {
      start = i + 1;
      break;
    }
  }
  let end = text.length;
  for (let i = cand.end; i < text.length; i++) {
    if (CLAUSE_SPLIT.test(text[i])) {
      end = i;
      break;
    }
  }
  if (cand.index - start > 20) start = cand.index - 20;
  if (end - cand.end > 25) end = cand.end + 25;
  return text.slice(start, Math.max(end, cand.end));
}

function extractTime(text, deadlineCand) {
  let scope = text;
  if (deadlineCand) {
    scope = timeScopeFor(text, deadlineCand);
  }
  let m = scope.match(
    new RegExp(
      // 【为什么词表里要单独放一个晚字】
      // 真实踩过坑：晚7点里的晚不在原来的时段词表里，
      // 走上没有时段的那个分支，晚上七点被算成早上七点，差了十二个小时。
      // 长词要放在短词前面，晚上必须先于晚匹配。
      "(上午|下午|中午|晚上|晚|凌晨|早上|早晨|傍晚)[ ]*([0-9]{1,2})[ ]*[点时](?:[ ]*([0-9]{1,2})[ ]*分?)?(?:[ ]*半)?"
    )
  );
  if (m) {
    let h = parseInt(m[2], 10);
    let min = m[3] ? parseInt(m[3], 10) : /半/.test(m[0]) ? 30 : 0;
    if (/(下午|晚上|晚|傍晚|中午)/.test(m[1]) && h < 12) h += 12;
    if (/凌晨/.test(m[1]) && h === 12) h = 0;
    return String(h).padStart(2, "0") + ":" + String(min).padStart(2, "0");
  }
  m = scope.match(new RegExp("(?<![0-9])([0-9]{1,2})[ ]*[:：][ ]*([0-9]{2})(?![0-9])"));
  if (m) return String(parseInt(m[1], 10)).padStart(2, "0") + ":" + m[2];
  m = scope.match(new RegExp("([0-9]{1,2})[ ]*[点时](?:[ ]*([0-9]{1,2})[ ]*分?)?(?:[ ]*半)?"));
  if (m) {
    const h = parseInt(m[1], 10);
    const min = m[2] ? parseInt(m[2], 10) : /半/.test(m[0]) ? 30 : 0;
    return String(h).padStart(2, "0") + ":" + String(min).padStart(2, "0");
  }
  return null;
}

// ---------- 地点 ----------

const LOCATION_KEYWORDS = [
  "办公室", "会议室", "报告厅", "教学楼", "实验楼", "综合楼", "大楼",
  "图书馆", "体育馆", "体育场", "运动场", "操场", "食堂", "宿舍",
  "活动室", "档案室", "实验室", "大厅", "门厅", "礼堂", "教室",
  "中心", "广场", "校区", "馆", "厅", "场", "楼", "室",
];

// 行政单位名结尾。
// 【为什么需要】真实踩过坑：无密钥跑一百条真实通知，地点有二十九条是空的，
// 空的里面绝大多数是行政单位名，报送至教务处考务科，交至财务处收费科，
// 到保卫处户籍科办理，签字后交回学院教务办，到教材科领取，校医院医保办。
// 而上面那张表里全是空间名词，一个处科室办部学院系都没有，
// 整句找不到关键词就直接返回空，等于这一类说法整类抽不到。
const UNIT_ENDINGS = [
  "办公室", "会议室", "教务办", "学工办", "学院", "系", "所", "中心", "站",
  "处", "科", "部", "办",, "团委"
];

// 结尾字后面紧跟这些字时，说明它其实不是单位名结尾。
// 【为什么需要】办会遇到办理和办法和办公和办事，处会遇到处理和处长和处的，
// 科会遇到科目和科研，部会遇到部门和部分，系会遇到系统和系列。
// 真实踩过坑：报名系统被当成单位名，凭空造出一个名系出来。
const UNIT_ENDING_BLOCKED_NEXT = {
  "办": "理法公事学",
  "处": "理长于的",
  "科": "目研学",
  "部": "门分",
  "系": "统列数",
};

// 提交和到达类动作词，只在它们后面找单位名，不整句乱找。
// 【为什么长词放前面】报送至必须先于报送匹配，否则送到会先把送字吃掉。
const UNIT_ACTION_SRC =
  "(?:报送至|报送|交至|交到|交于|交回|送回|报至|报到|提交至|发送至|送至|发至|送到|发送到|到|在|报)";

// 动作词和单位名之间可能夹的过渡成分，要丢掉。
// 【为什么】真实踩过坑：到所在学院教务办，所在两个字夹在中间。
const UNIT_LEAD_SKIP = ["所在", "各自", "本", "该", "其", "相关", "对应"];

// 单位名专用的动作词检查子集。
// 【为什么不直接用 ACTION_WORDS_FOR_LOCATION】那张表里含教育和培训和学习，
// 而单位名本身就带这些字，教师教育学院会被整条拒掉。
// 真实踩过坑：在教师教育学院A105举行，因为候选里含教育两个字被判成动作，
// 结果返回空，门牌号也跟着没了。这里只留与地点真正冲突的那些。
const UNIT_ACTION_BLOCK = [
  "开展", "举行", "举办", "排查", "检查", "整治", "施工", "装修",
  "闭馆", "闭园", "开放", "搬迁", "消毒", "检修", "维修", "改造",
  "建设", "清理", "整理", "调整", "召开", "参加", "进行",
];

function hasUnitActionWord(s) {
  for (const w of UNIT_ACTION_BLOCK) {
    if (s.indexOf(w) !== -1) return true;
  }
  return false;
}

/**
 * 动作词黑名单。
 *
 * 【为什么需要】
 * 真实踩过坑：原文“学校决定在全校范围内开展宿舍安全隐患大排查”，
 * 按“在……后面接地点”的规则，抽出来是“全校范围内开展宿舍”，
 * 明显不是地名，但界面上看不出错。
 * 更糟的是：这个假地点“不为空”，isRuleResultGood 以为本地已经搞定，
 * 不调 AI，结果截止日期也跟着没人修正——一处错连累两个字段。
 * 所以凡是地点候选里混着动作词，一律判为无效，让它变空，
 * 触发 AI 兜底去补。
 */
const ACTION_WORDS_FOR_LOCATION = [
  "开展", "举行", "举办", "进行", "排查", "检查", "组织", "安排",
  "召开", "参加", "参与", "完成", "落实", "推进", "实施", "部署",
  "启动", "发出", "印发", "宣传", "教育", "培训", "学习", "讨论",
  "总结", "评估", "核查", "抽查", "整治", "清理", "维修", "改造",
  "建设", "申报", "报送", "提交", "发放", "领取", "开会",
  "通报", "处理", "规定", "要求", "决定",
  // 补：设施状态与动作，防止整段被当成地点
  // 真实踩过坑：图书馆闭馆 被整段当地点，其实闭馆是动作不是地方
  "闭馆", "闭园", "开放", "开放时间", "装修", "施工", "停业",
  "整理", "调整", "搬迁", "消毒", "检修", "维护", "保养",
];

function hasActionWordInLocation(s) {
  for (const w of ACTION_WORDS_FOR_LOCATION) {
    if (s.includes(w)) return true;
  }
  return false;
}

function looksLikeTimeOrDateStart(s) {
  if (new RegExp("^[0-9]{4}[ ]*[-/年]").test(s)) return true;
  if (new RegExp("^[0-9]{1,2}[ ]*月[ ]*[0-9]{1,2}").test(s)) return true;
  if (new RegExp("^[0-9]{1,2}[ ]*[:：][ ]*[0-9]{1,2}").test(s)) return true;
  return false;
}

function cleanLocation(fragment) {
  if (!fragment) return null;
  let s = fragment.trim();
  if (!s) return null;

  if (new RegExp("[0-9]+[ ]*月[ ]*[0-9]+[ ]*[日号]").test(s)) return null;
  if (new RegExp("[0-9]+[ ]*[:：][ ]*[0-9]+").test(s)) return null;
  if (looksLikeTimeOrDateStart(s)) return null;

  // 先剥掉开头的时间段，再走后面的关键词截取。
  // 【为什么在这里剥】真实踩过坑：请未参加体检的同学于11月13日上午8点到11点到校医院三楼体检中心补检。
  // 在和至和到引导横扫时会从第一个到字后面开始取，拿到的是 11点到校医院三楼体检中心，
  // 时间前缀和地名粘在一起。只剥位于开头的时间表达，中间出现的时间不动，免得伤到地名本身。
  {
    let guard = 0;
    while (guard < 3) {
      const before = s;
      s = s.replace(
        new RegExp(
          "^[ ]*(?:上午|下午|中午|晚上|凌晨|早上|傍晚)?[ ]*" +
            "[0-9一二三四五六七八九十两]{1,2}[ ]*(?:[点时]|[:：])" +
            "(?:[ ]*[0-9]{1,2}[ ]*分?|[ ]*半)?" +
            "(?:[ ]*[-到至~][ ]*(?:上午|下午|中午|晚上|凌晨|早上|傍晚)?[ ]*" +
            "[0-9一二三四五六七八九十两]{1,2}[ ]*(?:[点时]|[:：])" +
            "(?:[ ]*[0-9]{1,2}[ ]*分?|[ ]*半)?)?" +
            "[ ]*(?:到|在|于|至)?[ ]*"
        ),
        ""
      );
      if (s === before) break;
      guard++;
    }
  }

  // 圆括号成对保留内部内容，不再在括号前截断。
  // 真实踩过坑：学院教学办公室（文科楼208）被截成 学院教学办公室（文科楼，
  // 门牌号和右括号都丢了。这里把圆括号整体摊平后再清洗。
  s = s.replace(new RegExp("[（(][^()（）]*[）)]", "g"), (mm) =>
    " " + mm.slice(1, mm.length - 1).trim() + " "
  );

  // 剥掉开头的在和季节这类修饰。
  // 【为什么需要】真实踩过坑：地点在本班自习教室，结果里前面挂着一个在字，
  // 抄到日历里读着别扭。冬季学生宿舍安全卫生检查这类写法，
  // 季节词会和地名粘在一起，也要剥掉，不然拿到的是冬季学生宿舍。
  s = s.replace(new RegExp("^[ ]*(?:在|于|至|到)[ ]*"), "");
  s = s.replace(
    new RegExp("^[ ]*(?:冬季|夏季|春季|秋季|寒假|暑假|本次|本届|本期)[ ]*"),
    ""
  );

  // 截到“最后一个地点关键词”的结尾。
  // 【为什么不截到第一个】
  // 真实踩过坑：“学生资助管理中心A301办公室”，
  // 如果截到第一个“中心”，后半截“A301办公室”会丢。
  // 用户按“学生资助管理中心”跑一趟，到那儿发现还得再找一间办公室。
  // 所以要找到最靠后的地点关键词，把整个复合地名完整保留。
  // 所有关键词一起找最后一个（撤回多字与单字分组的写法）。
  // 【为什么不能分组】单字 厅 室 在 多功能厅 值班室 里就是真正的末位，
  // 分组会让它被 图书馆 管理中心 这类多字词抢先，把尾巴截掉。
  let bestEnd = -1;
  for (const kw of LOCATION_KEYWORDS) {
    let idx = s.indexOf(kw);
    while (idx !== -1) {
      const end = idx + kw.length;
      if (end > bestEnd) bestEnd = end;
      idx = s.indexOf(kw, idx + 1);
    }
  }
  if (bestEnd === -1) return null;

  // 末位后面若紧跟门牌号或者楼层号，继续延伸吃掉。
  // 真实踩过坑：文科楼208 在 楼 字处截断，门牌号 208 丢失。
  // 这里只吃紧贴的第一段门牌号，吃到就停，避免把后面的句子吞进来。
  // 从单次延伸改成有限次循环，并补上窗口和柜台这类结尾。
  // 【为什么】真实踩过坑：交到学生事务大厅三号窗口。
  // 关键词最右处是大厅的厅字，后面剩三号窗口，
  // 单次延伸只吃到三号，用户拿到学生事务大厅三号还得猜三号是门牌还是窗口。
  // 吃到有结尾词的一段就停，最多两段，免得把后面的句子吞进来。
  let extended = bestEnd;
  {
    let guard = 0;
    while (guard < 2) {
      const before = extended;
      const rest = s.slice(extended);
      const m = rest.match(
        new RegExp(
          "^[ ]*[0-9A-Za-z一二三四五六七八九十百]+" +
            "(?:[ ]*(?:号|层|楼|座))?" +
            "(?:[ ]*(?:窗口|柜台|室|厅|场|馆|台|口))?"
        )
      );
      if (m && m[0].trim() !== "") {
        extended += m[0].length;
      }
      if (extended === before) break;
      guard++;
    }
  }

  let candidate = s.slice(0, extended).trim();

  // 动作词判断放在整串上做，不在截断后再判。
  // 【为什么不先截断再判】真实踩过坑：全校范围内开展安全隐患大排查，
  // 若先把开展及后面切掉，剩下的全校范围内看着像个正常地点会被提前返回，
  // 后面真正的保卫处值班室就没机会被找到。整串判含动作词不干净就返回空，
  // 让上游继续往后找，才是想要的。
  if (candidate.length < 2 || candidate.length > 30) return null;
  if (hasActionWordInLocation(candidate)) return null;
  return candidate;
}

/**
 * 从一段候选里按最靠后的单位名结尾切出单位名。
 * 取最靠后而不是最靠前。
 * 【为什么不取最靠前】真实踩过坑：教务处考务科如果取到前面的处字，
 * 只剩教务处，后面的考务科丢了，用户跑到教务处还得再问考务科在哪。
 */
function cutUnitName(fragment) {
  if (!fragment) return null;
  let s = String(fragment).trim();
  if (!s) return null;

  // 动作词和单位名之间夹了别的内容时，截掉最后一个介词及它前面那段。
  // 【为什么】真实踩过坑：报送自查表至保卫处，自查表和至字夹在中间，
  // 不截的话返回的是自查表至保卫处。
  const cut = s.search(new RegExp("[至到在向]"));
  if (cut !== -1) s = s.slice(cut + 1).trim();

  let changed = true;
  while (changed) {
    changed = false;
    for (const w of UNIT_LEAD_SKIP) {
      if (s.indexOf(w) === 0) {
        s = s.slice(w.length).trim();
        changed = true;
      }
    }
  }
  if (!s) return null;

  let bestEnd = -1;
  for (const ending of UNIT_ENDINGS) {
    let idx = s.indexOf(ending);
    while (idx !== -1) {
      const end = idx + ending.length;
      const next = s.slice(end, end + 1);
      const blocked = UNIT_ENDING_BLOCKED_NEXT[ending];
      const isBlocked = blocked && next !== "" && blocked.indexOf(next) !== -1;
      if (!isBlocked && end > bestEnd) bestEnd = end;
      idx = s.indexOf(ending, idx + 1);
    }
  }
  if (bestEnd === -1) return null;

  // 结尾字后紧跟门牌号就继续吃掉。
  // 【为什么】真实踩过坑：在教师教育学院A105举行，
  // 只给教师教育学院的话门牌号没了，用户还得自己找教室。
  let extended = bestEnd;
  {
    const rest = s.slice(extended);
    const m = rest.match(new RegExp("^[ ]*[0-9A-Za-z]+"));
    if (m && m[0].trim() !== "") extended += m[0].length;
  }

  const candidate = s.slice(0, extended).trim();
  if (candidate.length < 2 || candidate.length > 30) return null;
  if (hasUnitActionWord(candidate)) return null;
  if (looksLikeTimeOrDateStart(candidate)) return null;
  return candidate;
}

/**
 * 在提交和到达类动作词后面找行政单位名。
 * 每条命中只取动作词之后到标点为止的一小段，再交给 cutUnitName 切，
 * 避免把整句话都吞进来。
 */
function extractUnitLocation(text) {
  const re = new RegExp(
    UNIT_ACTION_SRC + "[ ]*([^" + LF + "，。；;：:、]{2,20})",
    "g"
  );
  let m;
  while ((m = re.exec(text)) !== null) {
    const unit = cutUnitName(m[1]);
    if (unit) return unit;
  }
  return null;
}

/**
 * 兜底扫描复合地名：X楼/X层/... + 室/厅/场/馆。
 * 覆盖“三楼自习室”“大学生活动中心一层大厅”这类
 * 没有“在/于/地点：”引导语的情况。
 */
function scanCompound(text) {
  const re = new RegExp(
    "([0-9一二三四五六七八九十]+(?:楼|层|号|座)[一-龥A-Za-z0-9]{0,10}?(?:室|厅|场|馆))",
    "g"
  );
  let m;
  while ((m = re.exec(text)) !== null) {
    const c = m[1].trim();
    if (c.length < 3) continue;
    if (hasActionWordInLocation(c)) continue;
    if (looksLikeTimeOrDateStart(c)) continue;
    return c;
  }
  return null;
}

/**
 * 对太短的、无楼层前缀的地点，尝试补上原文里的楼层修饰。
 * 例：“自习室” → 在原文里找到“三楼自习室”，完整返回。
 */
function enhanceWithCompound(loc, text) {
  if (loc.length > 4) return null;
  if (new RegExp("[0-9一二三四五六七八九十]+(?:楼|层|号|座)").test(loc)) return null;

  const re = new RegExp(
    "([0-9一二三四五六七八九十]+(?:楼|层|号|座)[一-龥A-Za-z0-9]{0,10}?" + loc + ")",
    "g"
  );
  let m;
  while ((m = re.exec(text)) !== null) {
    const c = m[1].trim();
    if (hasActionWordInLocation(c)) continue;
    if (looksLikeTimeOrDateStart(c)) continue;
    return c;
  }
  return null;
}

function extractLocation(text) {
  // 引导词后面除了冒号也认逗号。
  // 【为什么】真实踩过坑：活动地点，大学生活动中心一楼大厅。
  // 从微信复制过来的通知常用逗号代替冒号，只认冒号时整条匹配不上，
  // 退到后面一楼大厅那截，前半截地名就丢了。捕获段里排除的标点不变，
  // 所以引导词后面那个逗号被引走，整段地名能完整取到。
  let m = text.match(
    new RegExp("(?:地点|地址|场地|会场)[ ]*[:：,，][ ]*([^" + LF + "，。；;]{2,40})")
  );
  if (m) {
    const loc = cleanLocation(m[1]);
    if (loc) return enhanceWithCompound(loc, text) || loc;
  }

    // 引导词后面什么都不写也认。
  // 【为什么】真实踩过坑：公示通知里常写成 地点行政楼A302，
  // 既没有冒号也没有逗号，只认标点的版本整条匹配不上，门牌号跟着一起丢。
  // 这里只取更短的一段，并且同样交给清洗去截，免得把后面的整句吞进来。
  m = text.match(
    new RegExp("(?:地点|地址|场地|会场)[ ]*([^" + LF + "，。；;：:、]{2,20})")
  );
  if (m) {
    const loc = cleanLocation(m[1]);
    if (loc) return enhanceWithCompound(loc, text) || loc;
  }

const verbRe = new RegExp("(?:在|至|到|前往)[ ]*([^" + LF + "，。；;]{2,40})", "g");
  let mm;
  while ((mm = verbRe.exec(text)) !== null) {
    const loc = cleanLocation(mm[1]);
    if (loc) return enhanceWithCompound(loc, text) || loc;
  }

  const yuRe = new RegExp("于[ ]*([^" + LF + "，。；;0-9]{2,40})", "g");
  while ((mm = yuRe.exec(text)) !== null) {
    const loc = cleanLocation(mm[1]);
    if (loc) return enhanceWithCompound(loc, text) || loc;
  }

  const compound = scanCompound(text);
  if (compound) return compound;

  // 行政单位名放在最后兜底。
  // 【为什么不放在前面】前面几条路径已经能抽到的都不该被抢，
  // 放在最后就只影响原本返回空的那些，现有用例一条都不会变。
  const unit = extractUnitLocation(text);
  if (unit) return unit;

  return null;
}

// ---------- 材料 ----------

const MATERIAL_WORDS = [
  "申请表", "报名表", "申请书", "承诺书", "推荐信", "介绍信",
  "名单", "表格", "复印件", "原件", "照片", "材料", "附件",
  "报告", "论文", "计划书", "简历", "身份证", "学生证",
  "选民证", "户口本", "工作证", "团员证", "党费证",
  "黑色笔", "签字笔", "黑色签字笔", "铅笔", "钢笔",
  "作品", "文件", "证明", "证件", "回执", "汇总表", "登记表",
  "身份证复印件", "学生证复印件", "户口本复印件",
  "一寸照片", "二寸照片", "一寸免冠照片", "二寸免冠照片",
  "免冠照片", "证件照",
];

const ACTION_RE = new RegExp(
  "(提交|报送|上交|递交|携带|准备|附上|提供|填写|打印|带|将|需|须|应|上传|" +
    "交到|交至|交于|交给|汇总|填报|领取|补交|回交)"
);

// 这些词出现在材料前面，说明是在讲内容不是在要东西。
// 讲座介绍简历制作与面试技巧里的简历是讲座内容，不是要交的材料。
const MATERIAL_CONTEXT_BLOCK = new RegExp(
  "(?:介绍|讲解|讲授|分享|涵盖|涉及|内容包括|主题为|主题是|主题|内容)[^，。；；]{0,8}$"
);

// 材料词后面紧跟这些字，说明它是地名的一部分。
// 图南楼报告厅里的报告是地点，不是要交的材料。
const MATERIAL_PLACE_NEXT = [
  "厅", "馆", "楼", "室", "中心", "处", "部", "会堂", "会",
];

// 这些表名不是要交的材料，是时间安排一类，不能收。
const MATERIAL_FORM_BLOCK = new RegExp(
  "^(?:时间表|日程表|课程表|座位表|排班表|值班表|流程图|代表|表现|表扬|表格说明)$"
);

// 纸质 电子 手写这类前缀跟材料是一个整体，纸质申请表不能只给申请表。
const MATERIAL_PREFIX = ["纸质", "电子", "手写", "原件", "双面"];

const QUANTIFIER_CHARS = "支张份个本件套盒把台部只条枚页瓶包块片";
const NUMBER_CHARS = "0123456789一二三四五六七八九十两几";

const PUNCT_CHARS = "。，、；：！？.,;:!?（）()【】「」《》<>";

const LEADING_STOP_RE = new RegExp(
  "^(?:到|至|去|在|将|把|交|送|带|携|须|需|应|该|了|的|请|并|或)"
);

const TRAILING_PLACE_RE = new RegExp(
  "[到在至去](?:现场|学校|教室|办公室|会场|门口|大厅|前台|服务台|报到处|签到处|座位|位置)"
);

const HINT_WORDS = ["材料", "附件", "文件"];
const HINT_FOLLOW = ["：", ":", "包括", "如下", "有", "含"];

const RE_PAREN_CN = new RegExp("（[^（）]*）", "g");
const RE_PAREN_EN = new RegExp("[（(][^()（）]*[）)]", "g");

const HINT_PREFIX_PATTERNS = [
  new RegExp(
    "^(?:需带|需提交|需交|需提供|需附|请交|请提交|请携带|请带|提交|上交|递交|报送|携带|自备)?" +
    "(?:如下|以下|下面|下列)?" +
    "(?:材料|附件)" +
    "(?:如下|包括|有|含)?" +
    "[：:]"
  ),
  new RegExp(
    "^[到在至去][^，。；;：:]{1,15}?" +
    "(?:交|提交|报送|递交)" +
    "(?:如下|以下|下面|下列)?" +
    "(?:材料|附件)" +
    "(?:如下|包括|有|含)?" +
    "[：:]"
  ),
  new RegExp(
    "^(?:携带|自备|需带|须带|请带|另带|提交|上交|递交|报送|交|提供|附上)[：:]"
  ),
];

/**
 * 去掉材料清单开头的引导短语。
 *
 * 【为什么要循环多次】
 * 引导短语可能叠加，例如：
 *   “需带材料如下：” = “需带” + “材料” + “如下” + “：”
 * 单次正则替换只能去一层，循环几次直到不再变化，才能稳定清理干净。
 * 真实踩过坑：“需带材料如下：身份证”之前会返回“材料如下：身份证”，
 * 前面五个字全进材料清单了。
 */
function stripLeadingHints(text) {
  let t = String(text || "").trim();
  for (let i = 0; i < 3; i++) {
    const before = t;
    for (const re of HINT_PREFIX_PATTERNS) {
      t = t.replace(re, "").trim();
    }
    if (t === before) break;
  }
  return t;
}

/**
 * 去掉成对括号及其内容。循环 5 次处理嵌套。
 *
 * 【为什么必须在“分割”之前做，不能之后做】
 * 真实踩过坑：原文“携带身份证和选民证（今天会发到大家手里，大家填好保存好）”。
 * 如果先按逗号/顿号分割再清括号：
 *   分割 → “身份证和选民证（今天会发到大家手里” + “大家填好保存好）”
 *   两个碎片都带着没配对的半截括号，清括号清不掉，最后当成材料返回。
 * 所以顺序是：先清括号 → 再分割 → 再清洗每一项。
 */
function stripParentheses(text) {
  let result = String(text || "");
  for (let i = 0; i < 5; i++) {
    const before = result;
    result = result.replace(RE_PAREN_CN, "");
    result = result.replace(RE_PAREN_EN, "");
    if (result === before) break;
  }
  return result;
}

function trimPunctuation(s) {
  let start = 0;
  let end = s.length;
  while (start < end && PUNCT_CHARS.includes(s[start])) start++;
  while (end > start && PUNCT_CHARS.includes(s[end - 1])) end--;
  return s.slice(start, end);
}

/**
 * 清洗单个材料名。
 *
 * 处理顺序有讲究：
 *   1. 去引导短语（材料：、需带材料如下：）
 *   2. 去首尾标点
 *   3. 去开头数量词（一支 / 三份 / 1张）
 *   4. 去尾部“等”
 *   5. 截断尾部地点短语（到现场 / 在学校）
 *   6. 去尾部数量词（两张 / 三份）
 *
 * 第 3 步的数量词正则必须“数字 + 量词”成对出现。
 * 【为什么不能把量词写成可选】
 * 真实踩过坑：“一寸照片”的“一”是数字，“寸”不是量词，
 * 如果写成 `[数字]+[量词]?`，会匹配到“一”，把“寸照片”留给用户。
 * 改成 `[数字]+[量词]` 后，“一寸”整体不匹配，原样保留。
 */
function cleanMaterialItem(s) {
  let t = String(s || "").trim();
  if (!t) return null;

  t = stripLeadingHints(t);
  if (!t) return null;

  t = trimPunctuation(t);

  t = t.replace(
    new RegExp("^[" + NUMBER_CHARS + "]+[" + QUANTIFIER_CHARS + "]"),
    ""
  );

  t = t.replace(new RegExp("等$"), "");
  t = trimPunctuation(t.trim());

  const placeMatch = t.match(TRAILING_PLACE_RE);
  if (placeMatch && placeMatch.index > 0) {
    t = t.slice(0, placeMatch.index).trim();
    t = trimPunctuation(t);
  }

  t = t.replace(
    new RegExp("[" + NUMBER_CHARS + "]+[" + QUANTIFIER_CHARS + "]$"),
    ""
  );
  t = trimPunctuation(t);

  if (t.length < 1 || t.length > 20) return null;
  if (LEADING_STOP_RE.test(t)) return null;
  return t;
}

function isHintWordAt(text, word, idx) {
  if (!HINT_WORDS.includes(word)) return false;
  const after = text.slice(idx + word.length, idx + word.length + 4);
  for (const f of HINT_FOLLOW) {
    if (after.startsWith(f)) return true;
  }
  return false;
}

// 一个材料词在这一处该不该收。挡掉两种误提：
// 一是后面跟地点后缀的报告厅，二是前面是介绍讲解这类的讲座内容。
// 但原文里真有提交交到这类动作时不挡，动作比语境更可靠。
function isBlockedMaterialAt(text, word, idx) {
  const after = text.slice(idx + word.length, idx + word.length + 2);
  for (const suf of MATERIAL_PLACE_NEXT) {
    if (after.indexOf(suf) === 0) return true;
  }
  const before = text.slice(Math.max(0, idx - 15), idx);
  if (MATERIAL_CONTEXT_BLOCK.test(before)) {
    const hasRealAction = new RegExp(
      "(提交|报送|上交|递交|交到|交至|交于|交给|携带|附上|补交|回交|填写|填报)"
    ).test(before);
    if (!hasRealAction) return true;
  }
  return false;
}

// 材料词前面紧贴着纸质电子这类限定词时一起收进来。
function extendMaterialPrefix(text, word, start) {
  for (const pre of MATERIAL_PREFIX) {
    const from = start - pre.length;
    if (from >= 0 && text.slice(from, start) === pre) {
      return { word: pre + word, start: from };
    }
  }
  return { word, start };
}

function collectMaterialCandidates(text) {
  const candidates = [];
  for (const word of MATERIAL_WORDS) {
    let idx = text.indexOf(word);
    while (idx !== -1) {
      if (isHintWordAt(text, word, idx) || isBlockedMaterialAt(text, word, idx)) {
        idx = text.indexOf(word, idx + 1);
        continue;
      }
      const before = text.slice(Math.max(0, idx - 15), idx);
      const after = text.slice(
        idx + word.length,
        Math.min(text.length, idx + word.length + 10)
      );
      const context = before + after;
      const hasAction = ACTION_RE.test(before) || ACTION_RE.test(after);
      const hasOtherMaterial = MATERIAL_WORDS.some(
        (w) => w !== word && context.includes(w)
      );
      if (hasAction || hasOtherMaterial) {
        const ext = extendMaterialPrefix(text, word, idx);
        candidates.push({
          word: ext.word,
          start: ext.start,
          end: idx + word.length,
        });
      }
      idx = text.indexOf(word, idx + 1);
    }
  }
  return candidates.concat(collectFormCandidates(text));
}

// 体温监测表 签到表 确认表这类词表里没有的表单名。
// 词表不可能收全所有表名，这里认两到八个字加表单册的写法，
// 表名在原文里出现的时候要求附近有交带提交这类动作，宁缺勿滥。
function collectFormCandidates(text) {
  const found = [];
  const re = new RegExp("([一-龥]{2,8}?)(表|单|册)(?![格])", "g");
  let m;
  while ((m = re.exec(text)) !== null) {
    const word = m[0];
    const idx = m.index;
    // 前缀里混进点前将把的厅这类字，说明抓到的是时间和动作，不是表单名。
    // 丢掉之后从下一个字重新试，别把里面的真表单名一起跳过去。
    if (
      new RegExp(
        "[点前将把的厅了和及或与从向往由给用使是在至到日月年时分]"
      ).test(m[1])
    ) {
      re.lastIndex = idx + 1;
      continue;
    }
    if (MATERIAL_WORDS.includes(word)) continue;
    if (MATERIAL_FORM_BLOCK.test(word)) continue;
    if (isBlockedMaterialAt(text, word, idx)) continue;
    const before = text.slice(Math.max(0, idx - 15), idx);
    const after = text.slice(
      idx + word.length,
      Math.min(text.length, idx + word.length + 8)
    );
    const hasAction = ACTION_RE.test(before) || ACTION_RE.test(after);
    if (!hasAction) continue;
    const ext = extendMaterialPrefix(text, word, idx);
    found.push({ word: ext.word, start: ext.start, end: idx + word.length });
  }
  return found;
}

/**
 * 合并首尾相接的候选。
 *
 * 例：“身份证”[8,11] + “复印件”[11,14] → “身份证复印件”[8,14]。
 * 只在两个候选 end === start 时合并，中间有标点不会合并。
 * 这是“顿号列举的身份证复印件不能被拆开”那次的修法。
 */
function mergeAdjacentCandidates(candidates) {
  let list = [...candidates];
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < list.length; i++) {
      for (let j = 0; j < list.length; j++) {
        if (i === j) continue;
        if (list[i].end === list[j].start) {
          const mergedWord = list[i].word + list[j].word;
          if (mergedWord.length <= 20) {
            const merged = {
              word: mergedWord,
              start: list[i].start,
              end: list[j].end,
            };
            list = list.filter((_, k) => k !== i && k !== j);
            list.push(merged);
            changed = true;
            break outer;
          }
        }
      }
    }
  }
  return list;
}

/**
 * 位置感知去重。
 *
 * 【为什么不用简单的 Set / includes 去重】
 * “身份证和身份证复印件”里，“身份证”出现了两次：
 *   一次独立（“和”之前），一次是“身份证复印件”的前缀。
 * 简单 Set 去重会让“身份证”只保留一次，但分不清是保留独立的那次还是前缀的那次。
 * 位置感知去重：候选的每次出现，如果完全落在某个更长候选的区间内，算被覆盖；
 * 只要有一次出现未被覆盖，就保留这个词。保留的词按首次出现位置排序。
 */
function dedupeCandidates(candidates) {
  const sorted = [...candidates].sort(
    (a, b) => b.end - b.start - (a.end - a.start)
  );
  const covered = [];
  const keptWords = [];

  for (const c of sorted) {
    if (c.start < 0 || c.end < 0) {
      if (!keptWords.includes(c.word)) keptWords.push(c.word);
      continue;
    }
    const isCovered = covered.some(
      (r) => c.start >= r.start && c.end <= r.end
    );
    if (isCovered) continue;
    covered.push({ start: c.start, end: c.end });
    if (!keptWords.includes(c.word)) keptWords.push(c.word);
  }

  const firstIndex = {};
  for (const c of candidates) {
    if (c.start < 0) continue;
    if (!(c.word in firstIndex) || c.start < firstIndex[c.word]) {
      firstIndex[c.word] = c.start;
    }
  }
  return keptWords.sort((a, b) => {
    const ai = a in firstIndex ? firstIndex[a] : Number.MAX_SAFE_INTEGER;
    const bi = b in firstIndex ? firstIndex[b] : Number.MAX_SAFE_INTEGER;
    return ai - bi;
  });
}

function extractCarryItems(text) {
  const results = [];
  const CARRY_RE = new RegExp(
    "(?:携带|自备|需带|须带|请带|另带|带(?!领|来|队|头))[ ]*([^。；;" + LF + "]{2,200})",
    "g"
  );
  const SPLIT_RE = new RegExp(
    "[、，,]|以及|还有|另需|并带|还要带|还要|和|及|与"
  );

  let m;
  while ((m = CARRY_RE.exec(text)) !== null) {
    const cleaned = stripParentheses(m[1]);
    const parts = cleaned.split(SPLIT_RE);
    for (const p of parts) {
      const item = cleanMaterialItem(p);
      if (item && !results.includes(item)) results.push(item);
    }
  }
  return results;
}

/**
 * 抽取材料清单。三条路径合并，统一去重。
 *
 * 路径1：白名单扫描（在去括号文本上）
 * 路径2：携带动词清单（先清括号再分割）
 * 路径3：列举式（材料：A、B、C）
 *
 * 三条路径都会把命中位置记下来，最后走 mergeAdjacentCandidates + dedupeCandidates。
 * 不这样做，“身份证复印件”会因为白名单分别命中“身份证”和“复印件”而被拆开。
 */
function extractMaterials(text) {
  const noParens = stripParentheses(text);
  let candidates = [];

  candidates = candidates.concat(collectMaterialCandidates(noParens));

  const carryItems = extractCarryItems(text);
  for (const item of carryItems) {
    let idx = noParens.indexOf(item);
    if (idx === -1) {
      candidates.push({ word: item, start: -1, end: -1 });
    } else {
      while (idx !== -1) {
        candidates.push({ word: item, start: idx, end: idx + item.length });
        idx = noParens.indexOf(item, idx + 1);
      }
    }
  }

  const listMatch = text.match(
    new RegExp(
      "(?:材料|附件)[ ]*(?:包括|如下|有|含|：|:)[ ]*([^" + LF + "。；;]{1,80})"
    )
  );
  if (listMatch) {
    const cleanedList = stripParentheses(listMatch[1]);
    const items = cleanedList
      .split(new RegExp("[、,，和及与]"))
      .map((s) => cleanMaterialItem(s))
      .filter(Boolean);
    for (const item of items) {
      let idx = noParens.indexOf(item);
      if (idx === -1) {
        candidates.push({ word: item, start: -1, end: -1 });
      } else {
        while (idx !== -1) {
          candidates.push({ word: item, start: idx, end: idx + item.length });
          idx = noParens.indexOf(item, idx + 1);
        }
      }
    }
  }

  const merged = mergeAdjacentCandidates(candidates);
  return dedupeCandidates(merged);
}

// ---------- 面向对象 ----------

/**
 * 抽取面向对象。支持：
 *   1. 显式标签：面向/针对/参加对象/…
 *   2. @所有人 / @全体成员
 *   3. 群体短语：全体学生/全校学生/所有同学/所有人/各学院/各班级/
 *      2026级学生/本科生/研究生/全体学生/全校师生
 *
 * 【为什么“所有”要和“全体”“全校”并列】
 * 真实踩过坑：本地规则一开始只认“全体”“全校”，
 * 原文写“所有同学，都要参加”时抽不出来。
 * 而 AI 在摘要里写了“全体同学”——说明模型理解对了，
 * 只是本地词表没跟上。用户看着摘要写“全体同学”，
 * 面向对象那格却是空的，感觉程序在自相矛盾。
 */
function extractAudience(text) {
  const label = text.match(
    new RegExp(
      "(?:面向|针对|适用于?|参加对象|参会对象|活动对象)[ ]*[:：]?[ ]*([^" + LF + "，。；;]{2,30})"
    )
  );
  if (label) return label[1].trim();

  const at = text.match(new RegExp("@(所有人|全体成员)"));
  if (at) return at[1];

  const patterns = [
    "(全体[一-龥]{0,8}?(?:学生|师生|同学|教师|教职工|成员|人员|本科生|研究生|在校生))",
    "(全校[一-龥]{0,8}?(?:学生|师生|同学|教师|教职工|成员|人员|本科生|研究生|在校生))",
    "(所有[一-龥]{0,8}?(?:学生|师生|同学|教师|教职工|成员|人员|本科生|研究生|在校生))",
    "(所有人|所有同学|所有学生|所有师生|所有成员)",
    "(各[一-龥]{0,4}(?:学院|班级|班长|班|单位|部门|系|年级|支部|社团|宿舍))",
    "([0-9]{4}[ ]*级[一-龥]{0,8}?(?:学生|同学|本科生|研究生|班级))",
    "(本科生|研究生|全体学生|全校师生|全体师生)",
  ];
  for (const p of patterns) {
    const m = text.match(new RegExp(p));
    if (m) return m[1];
  }
  return null;
}

// ---------- 主入口 ----------

/**
 * 本地粗分类。只在模型没给分类时兜底。
 *
 * 【为什么词表按这个顺序排】助学金评审这类通知里既有评审也有会议，
 * 学生宿舍安全检查里既有安全也有宿舍，一个词会同时指向两个类别。
 * 顺序就是优先级，教务和后勤比行政具体，先判具体的，
 * 行政放最后收底，免得什么都落到行政。
 */
const CATEGORY_KEYWORDS = [
  // 行政里这几个词比教务和后勤都具体，放在最前面单独判。
  // 【为什么】诚信考试主题班会里有个考试，按教务先判会被判成教务，
  // 但它其实是要开的班会。助学金奖学金同理，不能因为提到了评审就落到别处。
  [
    "行政",
    ["班会", "青年大学习", "助学金", "奖学金", "资助"],
  ],
  [
    "教务",
    [
      "教务",
      "学籍",
      "选课",
      "考试",
      "成绩",
      "课表",
      "教材",
      "补考",
      "重修",
      "毕业",
      "学分",
      "培养方案",
      "实习",
      "论文",
      "四六级",
      "转专业",
      "评教",
    ],
  ],
  [
    "后勤",
    [
      "宿舍",
      "寝室",
      "食堂",
      "水电",
      "维修",
      "保洁",
      "门禁",
      "热水",
      "班车",
      "体检",
      "校园卡",
      "浴室",
      "空调",
      "供暖",
    ],
  ],
  [
    "活动",
    [
      "比赛",
      "大赛",
      "晚会",
      "讲座",
      "运动会",
      "社团",
      "文艺",
      "志愿服务",
      "征文",
      "演讲",
      "歌手",
      "篮球",
      "迎新",
      "辩论",
      "展演",
      "报告会",
    ],
  ],
  [
    "行政",
    [
      "报送",
      "汇总",
      "名单",
      "会议",
      "评审",
      "资助",
      "助学金",
      "奖学金",
      "团组织",
      "青年大学习",
      "档案",
      "考勤",
      "班会",
      "安全",
      "评优",
      "公示",
      "换届",
    ],
  ],
];

// 分类是推断出来的，不是从原文抄来的值。
// 所以有些词在特定位置不能当证据：行政楼里的行政说的是楼，不是说这是行政类通知。
const CATEGORY_BLOCK_NEXT = {
  行政: ["楼", "馆", "处", "大厅", "中心", "楼前", "办公室", "会议室"],
  活动: ["中心", "室", "厅"],
  会议: ["室", "厅", "楼", "中心", "场"],
};

function isCategoryWordAt(text, word, idx) {
  const block = CATEGORY_BLOCK_NEXT[word];
  if (!block) return true;
  const after = text.slice(idx + word.length, idx + word.length + 3);
  for (const b of block) {
    if (after.indexOf(b) === 0) return false;
  }
  return true;
}

function extractCategory(text) {
  if (!text) return null;
  for (const pair of CATEGORY_KEYWORDS) {
    const label = pair[0];
    const words = pair[1];
    for (const w of words) {
      let idx = text.indexOf(w);
      while (idx !== -1) {
        if (isCategoryWordAt(text, w, idx)) return label;
        idx = text.indexOf(w, idx + 1);
      }
    }
  }
  return null;
}

export function extractNotice(text) {
  const clean = (text || "").split(CRLF).join(LF).trim();

  const result = {
    deadline: null,
    eventDate: null,
    eventTime: null,
    time: null,
    location: null,
    materials: [],
    audience: null,
    category: null,
  };

  if (!clean) return result;

  const deadlineCand = extractDeadlineCandidate(clean);
  result.deadline = deadlineCand ? deadlineCand.text : null;
  const eventCand = extractEventDateCandidate(clean, deadlineCand);
  result.eventDate = eventCand ? eventCand.text : null;
  result.eventTime = eventCand ? extractTime(clean, eventCand) : null;
  result.time = extractTime(clean, deadlineCand);
  result.location = extractLocation(clean);
  result.materials = extractMaterials(clean);
  result.audience = extractAudience(clean);
  result.category = extractCategory(clean);

  if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
    console.log("[extractNotice] 输入：", clean);
    console.log("[extractNotice] 结果：", result);
  }

  return result;
}