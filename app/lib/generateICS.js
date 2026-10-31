/**
 * 生成符合 RFC 5545 的 ICS 日历文件
 * - 时区固定 Asia/Shanghai
 * - 行分隔符严格 CRLF
 * - 每行超过 75 字节自动折行（UTF-8 字符边界）
 * - 全部使用 String.fromCharCode 拼装特殊字符，避免反斜杠转义问题
 */

const CRLF = String.fromCharCode(13, 10);
const BS = String.fromCharCode(92); // 反斜杠
const encoder = new TextEncoder();

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatLocalDT(date) {
  return (
    date.getFullYear() +
    pad2(date.getMonth() + 1) +
    pad2(date.getDate()) +
    "T" +
    pad2(date.getHours()) +
    pad2(date.getMinutes()) +
    pad2(date.getSeconds())
  );
}

function formatUTC(date) {
  return (
    date.getUTCFullYear() +
    pad2(date.getUTCMonth() + 1) +
    pad2(date.getUTCDate()) +
    "T" +
    pad2(date.getUTCHours()) +
    pad2(date.getUTCMinutes()) +
    pad2(date.getUTCSeconds()) +
    "Z"
  );
}

/**
 * ICS 文本字段转义
 * 反斜杠 -> 双反斜杠
 * 分号 -> 反斜杠分号
 * 逗号 -> 反斜杠逗号
 * 换行 -> 反斜杠 n
 * 全部用 split/join + String.fromCharCode 拼装，不经过正则
 */
function escapeICSText(text) {
  let s = String(text || "");
  s = s.split(BS).join(BS + BS);
  s = s.split(";").join(BS + ";");
  s = s.split(",").join(BS + ",");
  s = s.split(CRLF).join(BS + "n");
  s = s.split(String.fromCharCode(10)).join(BS + "n");
  s = s.split(String.fromCharCode(13)).join(BS + "n");
  return s;
}

/**
 * 按 RFC 5545 折行：每行最多 75 字节（不含 CRLF），
 * 续行以 CRLF + 空格开头，且该空格计入续行的 75 字节。
 * 折行时只在字符边界切，不拆多字节字符。
 */
function foldLine(line) {
  if (encoder.encode(line).length <= 75) return line;

  const chars = Array.from(line); // 按 Unicode code point 迭代
  const pieces = [];
  let cur = "";
  let curBytes = 0;
  let isContinuation = false;

  for (const ch of chars) {
    const chBytes = encoder.encode(ch).length;
    // 首行容量 75，续行容量 74（要留 1 字节给续行前缀空格）
    const capacity = isContinuation ? 74 : 75;
    if (curBytes + chBytes > capacity) {
      pieces.push((isContinuation ? " " : "") + cur);
      cur = ch;
      curBytes = chBytes;
      isContinuation = true;
    } else {
      cur += ch;
      curBytes += chBytes;
    }
  }
  if (cur) pieces.push((isContinuation ? " " : "") + cur);

  return pieces.join(CRLF);
}

function makeUID() {
  return (
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 10) +
    "@zhiban.local"
  );
}

/**
 * @param {Object} options
 * @param {string} options.title
 * @param {Date}   options.deadlineDate
 * @param {string} [options.location]
 * @param {string} [options.description]
 * @returns {string} ICS 文件内容
 */
export function generateDeadlineICS({ title, deadlineDate, location, description }) {
  if (!(deadlineDate instanceof Date) || isNaN(deadlineDate.getTime())) {
    throw new Error("无效的截止日期");
  }

  const endDate = new Date(deadlineDate.getTime() + 30 * 60 * 1000);
  const now = new Date();
  const uid = makeUID();

  const rawLines = [
    "BEGIN:VCALENDAR",
    "PRODID:-//Zhiban//Campus Notice Assistant//CN",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VTIMEZONE",
    "TZID:Asia/Shanghai",
    "X-LIC-LOCATION:Asia/Shanghai",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0800",
    "TZOFFSETTO:+0800",
    "TZNAME:CST",
    "DTSTART:19700101T000000",
    "END:STANDARD",
    "END:VTIMEZONE",
    "BEGIN:VEVENT",
    "UID:" + uid,
    "DTSTAMP:" + formatUTC(now),
    "DTSTART;TZID=Asia/Shanghai:" + formatLocalDT(deadlineDate),
    "DTEND;TZID=Asia/Shanghai:" + formatLocalDT(endDate),
    "SUMMARY:" + escapeICSText(title || "通知截止提醒"),
    location ? "LOCATION:" + escapeICSText(location) : null,
    description ? "DESCRIPTION:" + escapeICSText(description) : null,
    "BEGIN:VALARM",
    "TRIGGER:-PT1D",
    "ACTION:DISPLAY",
    "DESCRIPTION:" + escapeICSText(title || "通知截止提醒"),
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter((l) => l !== null);

  const folded = rawLines.map(foldLine);
  return folded.join(CRLF) + CRLF;
}