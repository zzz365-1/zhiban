// app/lib/dedupe.js
// 导入去重：正文完全重复 / 标题重复（需用户确认）/ 未见过的。

// 空白字符：空格、制表符、换行、回车、全角空格
const WS_CHARS = [
  String.fromCharCode(32), // 空格
  String.fromCharCode(9), // 制表符
  String.fromCharCode(10), // 换行
  String.fromCharCode(13), // 回车
  String.fromCharCode(12288), // 全角空格
];

// 要一并去掉的标点（中英文逗号句号分号冒号顿号叹号问号和各类括号引号书名号）
const PUNCT_CHARS = [
  "，", "。", ",", ".",
  "；", ";",
  "：", ":",
  "、",
  "！", "!",
  "？", "?",
  "（", "）", "(", ")",
  "【", "】", "[", "]",
  "《", "》",
  "“", "”", "\"",
  "‘", "’", "'",
  "「", "」",
  "『", "』",
  "〈", "〉",
  "﹁", "﹂",
  "﹃", "﹄",
];

function escapeForClass(ch) {
  // 放进字符类里需要转义的字符：\ ] ^ - 以及 /（正则字面量构建无所谓，稳妥起见）
  if (
    ch === "\\" ||
    ch === "]" ||
    ch === "^" ||
    ch === "-" ||
    ch === "["
  ) {
    return "\\" + ch;
  }
  return ch;
}

const REMOVE_CLASS = (function () {
  const all = WS_CHARS.concat(PUNCT_CHARS);
  let body = "";
  for (let i = 0; i < all.length; i++) {
    body += escapeForClass(all[i]);
  }
  return body;
})();

const NORMALIZE_RE = new RegExp("[" + REMOVE_CLASS + "]", "g");

// 去掉空白与标点，返回纯字符串
export function normalizeForCompare(text) {
  const s = text == null ? "" : String(text);
  if (!s) return "";
  return s.replace(NORMALIZE_RE, "");
}

// 取正文第一行，去掉首尾空白（以及首尾回车这类行内空白）
export function noticeTitle(text) {
  const s = text == null ? "" : String(text);
  if (!s) return "";
  const lines = s.split(new RegExp("[" + String.fromCharCode(10) + String.fromCharCode(13) + "]"));
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t) return t;
  }
  return "";
}

// 疑似重复阈值：归一化相邻两字 Dice 系数
export const SIMILAR_THRESHOLD = 0.75;

// 归一化后取相邻两字组成集合，Dice = 交集数*2 / (集合A大小+集合B大小)
export function textSimilarity(a, b) {
  const sa = normalizeForCompare(a);
  const sb = normalizeForCompare(b);
  if (!sa.length || !sb.length) return 0;
  if (sa === sb) return 1;

  const setA = {};
  let sizeA = 0;
  for (let i = 0; i + 1 < sa.length; i++) {
    const g = sa.substring(i, i + 2);
    if (!Object.prototype.hasOwnProperty.call(setA, g)) {
      setA[g] = true;
      sizeA++;
    }
  }

  const setB = {};
  let sizeB = 0;
  for (let j = 0; j + 1 < sb.length; j++) {
    const g = sb.substring(j, j + 2);
    if (!Object.prototype.hasOwnProperty.call(setB, g)) {
      setB[g] = true;
      sizeB++;
    }
  }

  if (!sizeA || !sizeB) return 0;

  let inter = 0;
  for (const g in setA) {
    if (Object.prototype.hasOwnProperty.call(setB, g)) inter++;
  }
  return (inter * 2) / (sizeA + sizeB);
}

// 返回 { type, notice }；type: "exact" | "similar" | "title_same" | "none"
// similar 时额外带 score
export function checkDuplicate(text, notices) {
  const arr = Array.isArray(notices) ? notices : [];
  const normText = normalizeForCompare(text);

  // 1) 正文完全相等
  for (let i = 0; i < arr.length; i++) {
    const n = arr[i];
    if (!n || typeof n !== "object") continue;
    if (normalizeForCompare(n.text) === normText) {
      return { type: "exact", notice: n };
    }
  }

  // 2) 正文疑似重复：相似度 >= 阈值
  let best = null;
  let bestScore = -1;
  for (let i = 0; i < arr.length; i++) {
    const n = arr[i];
    if (!n || typeof n !== "object") continue;
    const s = textSimilarity(text, n.text);
    if (s >= SIMILAR_THRESHOLD && s > bestScore) {
      best = n;
      bestScore = s;
    }
  }
  if (best) {
    return { type: "similar", notice: best, score: bestScore };
  }

  // 3) 标题相同（标题取正文第一行）
  const normTitle = normalizeForCompare(noticeTitle(text));
  if (normTitle) {
    for (let i = 0; i < arr.length; i++) {
      const n = arr[i];
      if (!n || typeof n !== "object") continue;
      if (normalizeForCompare(noticeTitle(n.text)) === normTitle) {
        return { type: "title_same", notice: n };
      }
    }
  }

  return { type: "none", notice: null };
}

// 批量判定：texts 与已有通知、同批次内排在前面且未命中已有通知的正文比较
// 返回等长数组，每项 { type, notice, score, withinBatch }
// 已有通知优先；命中同批次内正文时 withinBatch 为 true，notice 为前面那条正文的包装对象
export function checkBatchDuplicates(texts, notices) {
  const list = Array.isArray(texts) ? texts : [];
  const arr = Array.isArray(notices) ? notices : [];
  const earlierTexts = [];
  const out = [];

  for (let i = 0; i < list.length; i++) {
    const text = list[i];
    const hit = checkDuplicate(text, arr);

    if (hit.type !== "none") {
      out.push({
        type: hit.type,
        notice: hit.notice,
        score: hit.type === "similar" ? hit.score : 1,
        withinBatch: false,
      });
    } else {
      const batchHit = checkDuplicate(text, earlierTexts);
      if (batchHit.type !== "none") {
        out.push({
          type: batchHit.type,
          notice: batchHit.notice,
          score: batchHit.type === "similar" ? batchHit.score : 1,
          withinBatch: true,
        });
      } else {
        out.push({ type: "none", notice: null, score: 0, withinBatch: false });
      }
    }

    earlierTexts.push({ text: text });
  }

  return out;
}

// 事项去重键：名称 + 日期 + 时间
export function itemCalendarKey(item) {
  if (!item || typeof item !== "object") return "";
  const name = item.name == null ? "" : String(item.name);
  const date = item.date == null ? "" : String(item.date);
  const time = item.time == null ? "" : String(item.time);
  return [name, date, time].join("|");
}

// 事项去重，保留先出现的那条
export function dedupeItems(items) {
  const arr = Array.isArray(items) ? items : [];
  const seen = {};
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    const key = itemCalendarKey(item);
    if (Object.prototype.hasOwnProperty.call(seen, key)) continue;
    seen[key] = true;
    out.push(item);
  }
  return out;
}
