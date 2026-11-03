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

// 返回 { type, notice }；type: "exact" | "title_same" | "none"
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

  // 2) 标题相同（标题取正文第一行）
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
