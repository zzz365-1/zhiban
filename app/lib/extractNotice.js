/**
 * 规则式通知信息提取器
 * 设计原则：全文件避免正则反斜杠
 *   - 数字用 [0-9] 代替 \\\\d
 *   - 空白用 [ ] 代替 \\\\s
 *   - 中文范围用 [一-龥] 代替 \\\\u4e00-\\\\u9fa5
 *   - 换行/回车用 String.fromCharCode 构造
 * 抽不到返回 null / []，绝不猜测
 */

const LF = String.fromCharCode(10);       // 换行符
const CRLF = String.fromCharCode(13, 10); // 回车+换行

// ---------- 日期 ----------

const DATE_SOURCES = [
  { source: "([0-9]{4})[ ]*[-/年.][ ]*([0-9]{1,2})[ ]*[-/月.][ ]*([0-9]{1,2})[ ]*[日号]?", flags: "g" },
  { source: "([0-9]{1,2})[ ]*月[ ]*([0-9]{1,2})[ ]*[日号]", flags: "g" },
  { source: "(?<![0-9])([0-9]{1,2})[ ]*[-/][ ]*([0-9]{1,2})(?![0-9])", flags: "g" },
  { source: "(?:本|这|下)?[ ]*(?:周|星期)[ ]*[一二三四五六日天]", flags: "g" },
  { source: "(?:大后天|后天|明天|今天)", flags: "g" },
  { source: "(?:[0-9]{1,2}[ ]*月[底初末]|本月[底初末]?|下月[底初末]?)", flags: "g" },
];

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
  found.sort((a, b) => a.index - b.index || b.length - a.length);
  const result = [];
  for (const d of found) {
    if (!result.some((k) => d.index < k.end && d.end > k.index)) result.push(d);
  }
  return result;
}

const DEADLINE_MARKERS = new RegExp("(截止|截至|期限|之前|以前|前完成|前提交|前报送|前将|前上传|前交)");

function extractDeadline(text) {
  const candidates = findDateCandidates(text);
  if (candidates.length === 0) return null;

  for (const d of candidates) {
    const before = text.slice(Math.max(0, d.index - 15), d.index);
    const after = text.slice(d.end, Math.min(text.length, d.end + 5));
    if (DEADLINE_MARKERS.test(before) || /^ *前/.test(after)) {
      return d.text;
    }
  }

  if (candidates.length === 1) return candidates[0].text;
  return null;
}

// ---------- 时间 ----------

function extractTime(text) {
  let m = text.match(
    new RegExp("(上午|下午|中午|晚上|凌晨|早上|傍晚)[ ]*([0-9]{1,2})[ ]*[点时](?:[ ]*([0-9]{1,2})[ ]*分?)?(?:[ ]*半)?")
  );
  if (m) {
    let h = parseInt(m[2], 10);
    let min = m[3] ? parseInt(m[3], 10) : (/半/.test(m[0]) ? 30 : 0);
    if (/(下午|晚上|傍晚|中午)/.test(m[1]) && h < 12) h += 12;
    if (/凌晨/.test(m[1]) && h === 12) h = 0;
    return String(h).padStart(2, "0") + ":" + String(min).padStart(2, "0");
  }

  m = text.match(new RegExp("(?<![0-9])([0-9]{1,2})[ ]*[:：][ ]*([0-9]{2})(?![0-9])"));
  if (m) {
    return String(parseInt(m[1], 10)).padStart(2, "0") + ":" + m[2];
  }

  m = text.match(new RegExp("([0-9]{1,2})[ ]*[点时](?:[ ]*([0-9]{1,2})[ ]*分?)?(?:[ ]*半)?"));
  if (m) {
    const h = parseInt(m[1], 10);
    const min = m[2] ? parseInt(m[2], 10) : (/半/.test(m[0]) ? 30 : 0);
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

function trimLocation(fragment) {
  if (!fragment) return null;
  const s = fragment.trim();
  if (!s) return null;
  if (new RegExp("[0-9]+[ ]*月[ ]*[0-9]+[ ]*[日号]").test(s)) return null;
  if (new RegExp("[0-9]+[ ]*[:：][ ]*[0-9]+").test(s)) return null;
  if (new RegExp("^[0-9]{4}[ ]*[-/年]").test(s)) return null;

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
  return s.slice(0, bestEnd).trim();
}

function extractLocation(text) {
  let m = text.match(
    new RegExp("(?:地点|地址|场地|会场)[ ]*[:：][ ]*([^" + LF + "，。；;]{2,40})")
  );
  if (m) {
    const loc = trimLocation(m[1]);
    if (loc) return loc;
  }

  const verbRe = new RegExp("(?:在|至|到|前往)[ ]*([^" + LF + "，。；;]{2,40})", "g");
  let mm;
  while ((mm = verbRe.exec(text)) !== null) {
    const loc = trimLocation(mm[1]);
    if (loc) return loc;
  }

  const yuRe = new RegExp("于[ ]*([^" + LF + "，。；;0-9]{2,40})", "g");
  while ((mm = yuRe.exec(text)) !== null) {
    const loc = trimLocation(mm[1]);
    if (loc) return loc;
  }

  return null;
}

// ---------- 材料 ----------

const MATERIAL_WORDS = [
  "申请表", "报名表", "申请书", "承诺书", "推荐信", "介绍信",
  "名单", "表格", "复印件", "原件", "照片", "材料", "附件",
  "报告", "论文", "计划书", "简历", "身份证", "学生证",
  "作品", "文件", "证明", "证件", "回执", "汇总表", "登记表",
];

const ACTION_RE = new RegExp("(提交|报送|上交|递交|携带|准备|附上|提供|填写|打印|带|将|需|须|应|上传)");

function extractMaterials(text) {
  const found = [];

  for (const word of MATERIAL_WORDS) {
    const idx = text.indexOf(word);
    if (idx === -1) continue;
    const before = text.slice(Math.max(0, idx - 15), idx);
    const after = text.slice(idx + word.length, Math.min(text.length, idx + word.length + 10));
    const context = before + after;
    const hasAction = ACTION_RE.test(before) || ACTION_RE.test(after);
    const hasOtherMaterial = MATERIAL_WORDS.some((w) => w !== word && context.includes(w));
    if (hasAction || hasOtherMaterial) found.push(word);
  }

  const listMatch = text.match(
    new RegExp("(?:材料|附件)[ ]*(?:包括|如下|有|含|：|:)[ ]*([^" + LF + "。；;]{1,80})")
  );
  if (listMatch) {
    const items = listMatch[1]
      .split(new RegExp("[、,，和及与]"))
      .map((s) => s.trim().replace(/^《|》$/g, ""))
      .filter((s) => s.length >= 2 && s.length <= 20);
    for (const item of items) {
      if (!found.includes(item)) found.push(item);
    }
  }

  return found;
}

// ---------- 面向对象 ----------

function extractAudience(text) {
  const label = text.match(
    new RegExp("(?:面向|针对|适用于?|参加对象|参会对象|活动对象)[ ]*[:：]?[ ]*([^" + LF + "，。；;]{2,30})")
  );
  if (label) return label[1].trim();

  const patterns = [
    "(全体[一-龥]{0,8}?(?:学生|师生|同学|教师|教职工|成员|人员|本科生|研究生))",
    "(全校[一-龥]{0,8}?(?:学生|师生|同学|教师|教职工|成员|人员|本科生|研究生))",
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