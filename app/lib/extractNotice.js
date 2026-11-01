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
function extractDeadline(text) {
  const candidates = findDateCandidates(text).filter(
    (c) => !INCOMPLETE_DATE.test(c.text)
  );
  if (candidates.length === 0) return null;
  for (const d of candidates) {
    const before = text.slice(Math.max(0, d.index - 15), d.index);
    const after = text.slice(d.end, Math.min(text.length, d.end + 5));
    if (DEADLINE_MARKERS.test(before) || /^ *前/.test(after)) return d.text;
  }
  if (candidates.length === 1) return candidates[0].text;
  return null;
}

// ---------- 时间 ----------

function extractTime(text) {
  let m = text.match(
    new RegExp(
      "(上午|下午|中午|晚上|凌晨|早上|傍晚)[ ]*([0-9]{1,2})[ ]*[点时](?:[ ]*([0-9]{1,2})[ ]*分?)?(?:[ ]*半)?"
    )
  );
  if (m) {
    let h = parseInt(m[2], 10);
    let min = m[3] ? parseInt(m[3], 10) : /半/.test(m[0]) ? 30 : 0;
    if (/(下午|晚上|傍晚|中午)/.test(m[1]) && h < 12) h += 12;
    if (/凌晨/.test(m[1]) && h === 12) h = 0;
    return String(h).padStart(2, "0") + ":" + String(min).padStart(2, "0");
  }
  m = text.match(new RegExp("(?<![0-9])([0-9]{1,2})[ ]*[:：][ ]*([0-9]{2})(?![0-9])"));
  if (m) return String(parseInt(m[1], 10)).padStart(2, "0") + ":" + m[2];
  m = text.match(new RegExp("([0-9]{1,2})[ ]*[点时](?:[ ]*([0-9]{1,2})[ ]*分?)?(?:[ ]*半)?"));
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
  const s = fragment.trim();
  if (!s) return null;

  if (new RegExp("[0-9]+[ ]*月[ ]*[0-9]+[ ]*[日号]").test(s)) return null;
  if (new RegExp("[0-9]+[ ]*[:：][ ]*[0-9]+").test(s)) return null;
  if (looksLikeTimeOrDateStart(s)) return null;

  // 截到“最后一个地点关键词”的结尾。
  // 【为什么不截到第一个】
  // 真实踩过坑：“学生资助管理中心A301办公室”，
  // 如果截到第一个“中心”，后半截“A301办公室”会丢。
  // 用户按“学生资助管理中心”跑一趟，到那儿发现还得再找一间办公室。
  // 所以要找到最靠后的地点关键词，把整个复合地名完整保留。
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

  const candidate = s.slice(0, bestEnd).trim();
  if (candidate.length < 2 || candidate.length > 30) return null;
  if (hasActionWordInLocation(candidate)) return null;
  return candidate;
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
  let m = text.match(
    new RegExp("(?:地点|地址|场地|会场)[ ]*[:：][ ]*([^" + LF + "，。；;]{2,40})")
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
  "(提交|报送|上交|递交|携带|准备|附上|提供|填写|打印|带|将|需|须|应|上传)"
);

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

function collectMaterialCandidates(text) {
  const candidates = [];
  for (const word of MATERIAL_WORDS) {
    let idx = text.indexOf(word);
    while (idx !== -1) {
      if (isHintWordAt(text, word, idx)) {
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
        candidates.push({ word, start: idx, end: idx + word.length });
      }
      idx = text.indexOf(word, idx + 1);
    }
  }
  return candidates;
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

export function extractNotice(text) {
  const clean = (text || "").split(CRLF).join(LF).trim();

  const result = {
    deadline: null,
    time: null,
    location: null,
    materials: [],
    audience: null,
  };

  if (!clean) return result;

  result.deadline = extractDeadline(clean);
  result.time = extractTime(clean);
  result.location = extractLocation(clean);
  result.materials = extractMaterials(clean);
  result.audience = extractAudience(clean);

  if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
    console.log("[extractNotice] 输入：", clean);
    console.log("[extractNotice] 结果：", result);
  }

  return result;
}